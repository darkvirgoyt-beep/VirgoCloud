import type { FastifyInstance } from "fastify";
import { currentUser } from "../lib/access.js";
import { prisma } from "../lib/prisma.js";

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/v1/dashboard", { preHandler: [app.authenticate] }, async (request) => {
    const user = currentUser(request);
    const servers = await prisma.server.findMany({
      where: user.role === "ADMIN" ? {} : { userId: user.id },
      include: { metrics: { orderBy: { recordedAt: "desc" }, take: 1 } }
    });
    const totals = servers.reduce((acc, server) => {
      const metric = server.metrics[0];
      acc.cpuPercent += metric?.cpuPercent ?? 0;
      acc.ramUsedMb += metric?.ramUsedMb ?? 0;
      acc.storageUsedGb += metric?.storageUsedGb ?? 0;
      acc.online += server.status === "RUNNING" ? 1 : 0;
      return acc;
    }, { cpuPercent: 0, ramUsedMb: 0, storageUsedGb: 0, online: 0 });
    return { totals: { totalServers: servers.length, ...totals }, servers };
  });
}
