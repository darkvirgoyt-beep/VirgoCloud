import type { FastifyInstance } from "fastify";
import { filePathSchema } from "@virgocloud/contracts";
import { z } from "zod";
import { accessibleServer, currentUser } from "../lib/access.js";
import { callAgent } from "../lib/agent-client.js";
import { prisma } from "../lib/prisma.js";

const paramsSchema = z.object({ serverId: z.string().cuid() });
const fileSchema = z.object({ path: filePathSchema, content: z.string().max(1024 * 1024) });
const uploadSchema = z.object({ path: filePathSchema, contentBase64: z.string().min(1).max(70 * 1024 * 1024) });
const pathQuerySchema = z.object({ path: z.string().optional().default("") });

export async function fileRoutes(app: FastifyInstance) {
  app.get("/v1/servers/:serverId/files", { preHandler: [app.authenticate] }, async (request) => {
    const { serverId } = paramsSchema.parse(request.params);
    const path = pathQuerySchema.parse(request.query).path;
    const server = await accessibleServer(request, serverId);
    if (!server.node) throw new Error("This server is not assigned to a node.");
    return callAgent(server.node, "GET", `/v1/servers/${server.id}/files?path=${encodeURIComponent(path)}`);
  });

  app.get("/v1/servers/:serverId/file", { preHandler: [app.authenticate] }, async (request) => {
    const { serverId } = paramsSchema.parse(request.params);
    const path = filePathSchema.parse(pathQuerySchema.parse(request.query).path);
    const server = await accessibleServer(request, serverId);
    if (!server.node) throw new Error("This server is not assigned to a node.");
    return callAgent(server.node, "GET", `/v1/servers/${server.id}/file?path=${encodeURIComponent(path)}`);
  });

  app.put("/v1/servers/:serverId/file", { preHandler: [app.authenticate] }, async (request) => {
    const { serverId } = paramsSchema.parse(request.params);
    const input = fileSchema.parse(request.body);
    const server = await accessibleServer(request, serverId);
    if (!server.node) throw new Error("This server is not assigned to a node.");
    const result = await callAgent<{ sizeBytes: number }>(server.node, "PUT", `/v1/servers/${server.id}/file`, input);
    await prisma.serverFile.upsert({ where: { serverId_path: { serverId: server.id, path: input.path } }, create: { serverId: server.id, path: input.path, sizeBytes: result.sizeBytes }, update: { sizeBytes: result.sizeBytes } });
    await prisma.auditLog.create({ data: { actorId: currentUser(request).id, serverId: server.id, action: "file.write", metadata: { path: input.path } } });
    return result;
  });

  app.post("/v1/servers/:serverId/upload", { preHandler: [app.authenticate] }, async (request) => {
    const { serverId } = paramsSchema.parse(request.params);
    const input = uploadSchema.parse(request.body);
    const server = await accessibleServer(request, serverId);
    if (!server.node) throw new Error("This server is not assigned to a node.");
    const result = await callAgent<{ sizeBytes: number }>(server.node, "POST", `/v1/servers/${server.id}/upload`, input);
    await prisma.serverFile.upsert({ where: { serverId_path: { serverId: server.id, path: input.path } }, create: { serverId: server.id, path: input.path, sizeBytes: result.sizeBytes }, update: { sizeBytes: result.sizeBytes } });
    await prisma.auditLog.create({ data: { actorId: currentUser(request).id, serverId: server.id, action: "file.upload", metadata: { path: input.path, sizeBytes: result.sizeBytes } } });
    return result;
  });

  app.delete("/v1/servers/:serverId/file", { preHandler: [app.authenticate] }, async (request) => {
    const { serverId } = paramsSchema.parse(request.params);
    const path = filePathSchema.parse(pathQuerySchema.parse(request.query).path);
    const server = await accessibleServer(request, serverId);
    if (!server.node) throw new Error("This server is not assigned to a node.");
    await callAgent(server.node, "DELETE", `/v1/servers/${server.id}/file?path=${encodeURIComponent(path)}`);
    await prisma.serverFile.deleteMany({ where: { serverId: server.id, path } });
    await prisma.auditLog.create({ data: { actorId: currentUser(request).id, serverId: server.id, action: "file.delete", metadata: { path } } });
    return { ok: true };
  });
}
