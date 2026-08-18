import { Worker } from "bullmq";
import { createHash } from "node:crypto";
import { callAgent } from "./lib/agent-client.js";
import { prisma } from "./lib/prisma.js";
import { orchestrationQueue, redis, type OrchestrationJob } from "./lib/queue.js";
import { createBackupUploadUrl } from "./lib/s3.js";

async function provision(serverId: string) {
  const server = await prisma.server.findUnique({ where: { id: serverId }, include: { node: true } });
  if (!server?.node) throw new Error("Server has no assigned node.");
  await prisma.server.update({ where: { id: server.id }, data: { status: "PROVISIONING" } });
  const result = await callAgent<{ host?: string; port?: number; status: "OFFLINE" | "RUNNING" | "ERROR" }>(server.node, "POST", `/v1/servers/${server.id}/provision`, {
    containerName: server.containerName,
    edition: server.edition,
    version: server.version,
    software: server.software,
    ramMb: server.ramMb,
    playerSlots: server.playerSlots,
    difficulty: server.difficulty,
    gameMode: server.gameMode,
    port: server.port ?? (server.edition === "JAVA" ? 25565 : 19132),
    autoStart: server.desiredState === "RUNNING"
  });
  await prisma.server.update({ where: { id: server.id }, data: { host: result.host, port: result.port, status: result.status } });
}

async function backup(serverId: string, backupId?: string, requestedBy?: string) {
  const server = await prisma.server.findUnique({ where: { id: serverId }, include: { node: true, backupSchedule: true } });
  if (!server?.node) throw new Error("Server has no assigned node.");
  const backup = backupId
    ? await prisma.backup.findUniqueOrThrow({ where: { id: backupId } })
    : await prisma.backup.create({ data: { serverId: server.id, storageKey: `backups/${server.userId}/${server.id}/${Date.now()}-scheduled.tar.gz`, triggeredBy: requestedBy ?? "scheduler" } });
  await prisma.backup.update({ where: { id: backup.id }, data: { status: "UPLOADING" } });
  const uploadUrl = await createBackupUploadUrl(backup.storageKey);
  const result = await callAgent<{ sizeBytes: number; checksum: string }>(server.node, "POST", `/v1/servers/${server.id}/backup`, { containerName: server.containerName, uploadUrl });
  await prisma.backup.update({ where: { id: backup.id }, data: { status: "AVAILABLE", sizeBytes: result.sizeBytes, checksum: result.checksum, completedAt: new Date() } });
  if (server.backupSchedule) {
    await prisma.backupSchedule.update({ where: { serverId: server.id }, data: { nextRunAt: new Date(Date.now() + server.backupSchedule.intervalHours * 3_600_000) } });
  }
  await orchestrationQueue.add("cleanup", { kind: "cleanup", serverId: server.id }, { jobId: `cleanup:${server.id}:${backup.id}`, removeOnComplete: 100, removeOnFail: 100 });
}

async function cleanup(serverId: string) {
  const schedule = await prisma.backupSchedule.findUnique({ where: { serverId } });
  if (!schedule) return;
  const oldBackups = await prisma.backup.findMany({ where: { serverId, status: "AVAILABLE" }, orderBy: { createdAt: "desc" }, skip: schedule.retentionCount });
  if (oldBackups.length) await prisma.backup.deleteMany({ where: { id: { in: oldBackups.map((backup) => backup.id) } } });
}

/** This is independent of browser sessions: every minute, it restarts only servers that users have explicitly marked as desired RUNNING. */
async function reconcileRunningServers() {
  const servers = await prisma.server.findMany({ where: { desiredState: "RUNNING" }, include: { node: true } });
  for (const server of servers) {
    if (!server.node || server.node.status !== "ONLINE") continue;
    try {
      const result = await callAgent<{ status: "RUNNING" | "OFFLINE" }>(server.node, "POST", `/v1/servers/${server.id}/reconcile`, { containerName: server.containerName });
      await prisma.server.update({ where: { id: server.id }, data: { status: result.status } });
    } catch (error) {
      console.warn(`Reconciliation deferred for ${server.id}:`, error instanceof Error ? error.message : error);
    }
  }
}

const worker = new Worker<OrchestrationJob>("orchestration", async (job) => {
  if (job.data.kind === "provision") return provision(job.data.serverId);
  if (job.data.kind === "backup") return backup(job.data.serverId, job.data.backupId, job.data.requestedBy);
  if (job.data.kind === "cleanup") return cleanup(job.data.serverId);
  return reconcileRunningServers();
}, { connection: redis, concurrency: 4 });

void orchestrationQueue.add("reconcile-running-servers", { kind: "reconcile" }, { jobId: "reconcile-running-servers", repeat: { every: 60_000 }, removeOnComplete: 10, removeOnFail: 10 }).catch((error) => console.error("Could not schedule server reconciliation:", error));

worker.on("completed", (job) => console.info(`Completed ${job.name}:${job.id}`));
worker.on("failed", async (job, error) => {
  console.error(`Failed ${job?.name}:${job?.id}`, error);
  const data = job?.data;
  if (!data) return;
  if (data.kind === "backup" && data.backupId) await prisma.backup.update({ where: { id: data.backupId }, data: { status: "FAILED" } }).catch(() => undefined);
  if (data.kind === "provision") await prisma.server.update({ where: { id: data.serverId }, data: { status: "ERROR" } }).catch(() => undefined);
});

process.on("SIGTERM", async () => { await worker.close(); await redis.quit(); await prisma.$disconnect(); process.exit(0); });
