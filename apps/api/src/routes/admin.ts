import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { adminOnly } from "../lib/access.js";
import { prisma } from "../lib/prisma.js";

const userIdSchema = z.object({ userId: z.string().cuid() });
const limitsSchema = z.object({ maxServers: z.number().int().min(0).max(100), maxRamMb: z.number().int().min(1024).max(262144), maxStorageGb: z.number().int().min(1).max(2048) });

export async function adminRoutes(app: FastifyInstance) {
  app.get("/v1/admin/overview", { preHandler: [app.authenticate] }, async (request) => {
    adminOnly(request);
    const [users, servers, nodes, recentLogs] = await Promise.all([
      prisma.user.count(),
      prisma.server.count(),
      prisma.node.findMany({ select: { id: true, name: true, status: true, cpuPercent: true, ramUsedMb: true, ramTotalMb: true, diskUsedGb: true, diskTotalGb: true, runningServers: true } }),
      prisma.auditLog.findMany({ include: { actor: { select: { email: true } }, server: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 50 })
    ]);
    return { users, servers, nodes, recentLogs };
  });

  app.get("/v1/admin/users", { preHandler: [app.authenticate] }, async (request) => {
    adminOnly(request);
    return prisma.user.findMany({ include: { limit: true, _count: { select: { servers: true } } }, orderBy: { createdAt: "desc" } });
  });

  app.put("/v1/admin/users/:userId/limits", { preHandler: [app.authenticate] }, async (request) => {
    adminOnly(request);
    const { userId } = userIdSchema.parse(request.params);
    const input = limitsSchema.parse(request.body);
    return prisma.serverLimit.upsert({ where: { userId }, create: { userId, ...input }, update: input });
  });
}
