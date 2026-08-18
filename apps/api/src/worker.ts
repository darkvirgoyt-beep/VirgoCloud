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
  const result = await callAgent<{ host?: string; port?: number; status: "OFFLINE" | "ERROR" }>(server.node, "POST", `/v1/servers/${server.id}/provision`, {
    containerName: server.containerName,
    edition: server.edition,
    version: server.version,
    software: server.software,
    ramMb: server.ramMb,
    playerSlots: server.playerSlots,
    difficulty: server.difficulty,
    gameMode: server.gameMode
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

const worker = new Worker<OrchestrationJob>("orchestration", async (job) => {
  if (job.data.kind === "provision") return provision(job.data.serverId);
  if (job.data.kind === "backup") return backup(job.data.serverId, job.data.backupId, job.data.requestedBy);
  return cleanup(job.data.serverId);
}, { connection: redis, concurrency: 4 });

worker.on("completed", (job) => console.info(`Completed ${job.name}:${job.id}`));
worker.on("failed", async (job, error) => {
  console.error(`Failed ${job?.name}:${job?.id}`, error);
  const serverId = job?.data.serverId;
  if (serverId && job?.data.kind === "backup" && job.data.backupId) await prisma.backup.update({ where: { id: job.data.backupId }, data: { status: "FAILED" } }).catch(() => undefined);
  if (serverId && job?.data.kind === "provision") await prisma.server.update({ where: { id: serverId }, data: { status: "ERROR" } }).catch(() => undefined);
});

process.on("SIGTERM", async () => { await worker.close(); await redis.quit(); await prisma.$disconnect(); process.exit(0); });
