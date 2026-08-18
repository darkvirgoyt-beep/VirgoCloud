import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { createServerSchema, serverActionSchema, terminalCommandSchema, updateServerSchema } from "@virgocloud/contracts";
import { z } from "zod";
import { accessibleServer, currentUser } from "../lib/access.js";
import { callAgent } from "../lib/agent-client.js";
import { prisma } from "../lib/prisma.js";
import { orchestrationQueue } from "../lib/queue.js";

const serverIdSchema = z.object({ serverId: z.string().cuid() });

export async function serverRoutes(app: FastifyInstance) {
  app.get("/v1/servers", { preHandler: [app.authenticate] }, async (request) => {
    const user = currentUser(request);
    return prisma.server.findMany({
      where: user.role === "ADMIN" ? {} : { userId: user.id },
      include: { node: { select: { name: true, region: true } }, metrics: { orderBy: { recordedAt: "desc" }, take: 1 } },
      orderBy: { updatedAt: "desc" }
    });
  });

  app.post("/v1/servers", { preHandler: [app.authenticate] }, async (request, reply) => {
    const input = createServerSchema.parse(request.body);
    const user = currentUser(request);
    const limits = await prisma.serverLimit.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} });
    const usage = await prisma.server.aggregate({ where: { userId: user.id }, _count: { id: true }, _sum: { ramMb: true } });
    if (usage._count.id >= limits.maxServers || (usage._sum.ramMb ?? 0) + input.ramMb > limits.maxRamMb) return reply.code(403).send({ message: "Your account resource limit would be exceeded." });
    const node = input.nodeId
      ? await prisma.node.findFirst({ where: { id: input.nodeId, status: "ONLINE" } })
      : await prisma.node.findFirst({ where: { status: "ONLINE" }, orderBy: { cpuPercent: "asc" } });
    if (!node) return reply.code(503).send({ message: "No healthy node is available. Ask an administrator to enroll a runner." });
    const id = randomUUID();
    const server = await prisma.server.create({
      data: { id, userId: user.id, nodeId: node.id, name: input.name, edition: input.edition, version: input.version, software: input.software, ramMb: input.ramMb, playerSlots: input.playerSlots, difficulty: input.difficulty, gameMode: input.gameMode, containerName: `vc-${id.replace(/-/g, "")}` }
    });
    await orchestrationQueue.add("provision", { kind: "provision", serverId: server.id }, { jobId: `provision:${server.id}`, removeOnComplete: 100, removeOnFail: 100 });
    await prisma.auditLog.create({ data: { actorId: user.id, serverId: server.id, action: "server.create", metadata: input } });
    return reply.code(202).send(server);
  });

  app.get("/v1/servers/:serverId", { preHandler: [app.authenticate] }, async (request) => {
    return accessibleServer(request, serverIdSchema.parse(request.params).serverId);
  });

  app.patch("/v1/servers/:serverId", { preHandler: [app.authenticate] }, async (request) => {
    const serverId = serverIdSchema.parse(request.params).serverId;
    const input = updateServerSchema.parse(request.body);
    const server = await accessibleServer(request, serverId);
    return prisma.server.update({ where: { id: server.id }, data: input });
  });

  app.post("/v1/servers/:serverId/actions/:action", { preHandler: [app.authenticate] }, async (request) => {
    const { serverId } = serverIdSchema.parse(request.params);
    const action = serverActionSchema.parse((request.params as { action: string }).action);
    const server = await accessibleServer(request, serverId);
    if (!server.node) throw new Error("This server is not assigned to a node.");
    const result = await callAgent<{ status: string }>(server.node, "POST", `/v1/servers/${server.id}/actions`, { action, containerName: server.containerName });
    await prisma.server.update({ where: { id: server.id }, data: { status: result.status as never } });
    await prisma.auditLog.create({ data: { actorId: currentUser(request).id, serverId: server.id, action: `server.${action}` } });
    return result;
  });

  app.post("/v1/servers/:serverId/command", { preHandler: [app.authenticate] }, async (request) => {
    const { serverId } = serverIdSchema.parse(request.params);
    const { command } = terminalCommandSchema.parse(request.body);
    const server = await accessibleServer(request, serverId);
    if (!server.node) throw new Error("This server is not assigned to a node.");
    const result = await callAgent<{ output: string }>(server.node, "POST", `/v1/servers/${server.id}/command`, { command, containerName: server.containerName });
    await prisma.auditLog.create({ data: { actorId: currentUser(request).id, serverId: server.id, action: "server.command", metadata: { command } } });
    return result;
  });
}
