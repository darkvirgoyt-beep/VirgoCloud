import type { FastifyInstance } from "fastify";
import { agentHeartbeatSchema, nodeEnrollmentSchema } from "@virgocloud/contracts";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { adminOnly } from "../lib/access.js";
import { callAgent } from "../lib/agent-client.js";
import { encryptSecret, verifyAgentSignature } from "../lib/crypto.js";
import { prisma } from "../lib/prisma.js";

const nodeIdSchema = z.object({ nodeId: z.string().cuid() });

export async function nodeRoutes(app: FastifyInstance) {
  app.get("/v1/nodes", { preHandler: [app.authenticate] }, async (request) => {
    adminOnly(request);
    return prisma.node.findMany({ include: { _count: { select: { servers: true } } }, orderBy: { createdAt: "desc" } });
  });

  app.post("/v1/nodes", { preHandler: [app.authenticate] }, async (request, reply) => {
    adminOnly(request);
    const input = nodeEnrollmentSchema.parse(request.body);
    const enrollmentSecret = randomBytes(32).toString("base64url");
    const node = await prisma.node.create({ data: { ...input, secretCiphertext: encryptSecret(enrollmentSecret) } });
    try {
      await callAgent<{ version: string }>(node, "POST", "/v1/enroll", { nodeId: node.id, agentSecret: enrollmentSecret });
      await prisma.node.update({ where: { id: node.id }, data: { status: "ONLINE" } });
    } catch (error) {
      request.log.warn({ err: error, nodeId: node.id }, "Node enrolled but agent handshake is pending");
    }
    return reply.code(201).send({ node: { ...node, secretCiphertext: undefined }, enrollmentSecret });
  });

  app.post("/v1/nodes/:nodeId/heartbeat", async (request, reply) => {
    const { nodeId } = nodeIdSchema.parse(request.params);
    const rawBody = JSON.stringify(request.body ?? {});
    const node = await prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) return reply.code(404).send({ message: "Node not found." });
    const signature = request.headers["x-vc-signature"];
    const timestamp = request.headers["x-vc-timestamp"];
    if (typeof signature !== "string" || typeof timestamp !== "string" || !verifyAgentSignature((await import("../lib/crypto.js")).decryptSecret(node.secretCiphertext), request.method, request.url.split("?")[0], timestamp, rawBody, signature)) return reply.code(401).send({ message: "Invalid node signature." });
    const input = agentHeartbeatSchema.parse(request.body);
    await prisma.node.update({ where: { id: node.id }, data: { status: "ONLINE", ...input, lastHeartbeatAt: new Date() } });
    await prisma.nodeMetric.create({ data: { nodeId: node.id, cpuPercent: input.cpuPercent, ramUsedMb: input.ramUsedMb, diskUsedGb: input.diskUsedGb } });
    return { ok: true };
  });
}
