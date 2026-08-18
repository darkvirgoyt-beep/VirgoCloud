import type { FastifyInstance } from "fastify";
import { backupScheduleSchema } from "@virgocloud/contracts";
import { z } from "zod";
import { accessibleServer, currentUser } from "../lib/access.js";
import { callAgent } from "../lib/agent-client.js";
import { prisma } from "../lib/prisma.js";
import { orchestrationQueue } from "../lib/queue.js";
import { applyBackupSchedule, disableBackupSchedule } from "../lib/schedule.js";
import { createBackupDownloadUrl } from "../lib/s3.js";

const paramsSchema = z.object({ serverId: z.string().min(1).max(64) });
const backupParamsSchema = z.object({ serverId: z.string().min(1).max(64), backupId: z.string().cuid() });

export async function backupRoutes(app: FastifyInstance) {
  app.get("/v1/servers/:serverId/backups", { preHandler: [app.authenticate] }, async (request) => {
    const { serverId } = paramsSchema.parse(request.params);
    const server = await accessibleServer(request, serverId);
    const backups = await prisma.backup.findMany({ where: { serverId: server.id }, orderBy: { createdAt: "desc" } });
    return { schedule: server.backupSchedule, backups };
  });

  app.post("/v1/servers/:serverId/backups", { preHandler: [app.authenticate] }, async (request, reply) => {
    const { serverId } = paramsSchema.parse(request.params);
    const server = await accessibleServer(request, serverId);
    const backup = await prisma.backup.create({ data: { serverId: server.id, storageKey: `backups/${server.userId}/${server.id}/${Date.now()}-manual.tar.gz`, triggeredBy: currentUser(request).id } });
    await orchestrationQueue.add("backup", { kind: "backup", serverId: server.id, backupId: backup.id, requestedBy: currentUser(request).id }, { jobId: `backup:${backup.id}`, removeOnComplete: 100, removeOnFail: 100 });
    return reply.code(202).send(backup);
  });

  app.put("/v1/servers/:serverId/backups/schedule", { preHandler: [app.authenticate] }, async (request) => {
    const { serverId } = paramsSchema.parse(request.params);
    const input = backupScheduleSchema.parse(request.body);
    const server = await accessibleServer(request, serverId);
    const schedule = await applyBackupSchedule(server.id, input.intervalHours, input.retentionCount);
    await prisma.auditLog.create({ data: { actorId: currentUser(request).id, serverId: server.id, action: "backup.schedule", metadata: input } });
    return schedule;
  });

  app.delete("/v1/servers/:serverId/backups/schedule", { preHandler: [app.authenticate] }, async (request) => {
    const { serverId } = paramsSchema.parse(request.params);
    const server = await accessibleServer(request, serverId);
    return disableBackupSchedule(server.id);
  });

  app.post("/v1/servers/:serverId/backups/:backupId/restore", { preHandler: [app.authenticate] }, async (request, reply) => {
    const { serverId, backupId } = backupParamsSchema.parse(request.params);
    const server = await accessibleServer(request, serverId);
    const backup = await prisma.backup.findFirst({ where: { id: backupId, serverId: server.id, status: "AVAILABLE" } });
    if (!backup || !server.node) return reply.code(404).send({ message: "Available backup or assigned node not found." });
    const downloadUrl = await createBackupDownloadUrl(backup.storageKey);
    await prisma.backup.update({ where: { id: backup.id }, data: { status: "RESTORING" } });
    const result = await callAgent(server.node, "POST", `/v1/servers/${server.id}/restore`, { containerName: server.containerName, downloadUrl });
    await prisma.backup.update({ where: { id: backup.id }, data: { status: "AVAILABLE" } });
    await prisma.auditLog.create({ data: { actorId: currentUser(request).id, serverId: server.id, action: "backup.restore", metadata: { backupId } } });
    return result;
  });
}
