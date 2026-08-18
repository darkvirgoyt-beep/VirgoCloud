import type { FastifyRequest } from "fastify";
import { prisma } from "./prisma.js";

export function currentUser(request: FastifyRequest) {
  if (!request.authUser) throw new Error("Authentication required.");
  return request.authUser;
}

export async function accessibleServer(request: FastifyRequest, serverId: string) {
  const user = currentUser(request);
  const server = await prisma.server.findFirst({
    where: user.role === "ADMIN" ? { id: serverId } : { id: serverId, userId: user.id },
    include: { node: true, user: { select: { email: true, name: true } }, backupSchedule: true }
  });
  if (!server) {
    const error = new Error("Server not found.") as Error & { statusCode?: number };
    error.statusCode = 404;
    throw error;
  }
  return server;
}

export function adminOnly(request: FastifyRequest) {
  const user = currentUser(request);
  if (user.role !== "ADMIN") {
    const error = new Error("Administrator privileges required.") as Error & { statusCode?: number };
    error.statusCode = 403;
    throw error;
  }
  return user;
}
