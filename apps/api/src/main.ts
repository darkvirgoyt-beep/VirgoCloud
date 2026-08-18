import "./types.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import websocket from "@fastify/websocket";
import { ZodError } from "zod";
import { env } from "./env.js";
import { authRoutes } from "./routes/auth.js";
import { serverRoutes } from "./routes/servers.js";
import { fileRoutes } from "./routes/files.js";
import { backupRoutes } from "./routes/backups.js";
import { nodeRoutes } from "./routes/nodes.js";
import { adminRoutes } from "./routes/admin.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { consoleRoutes } from "./routes/console.js";

const app = Fastify({ logger: env.NODE_ENV === "development" ? { transport: { target: "pino-pretty" } } : true });

await app.register(cors, { origin: env.WEB_ORIGIN, credentials: false });
await app.register(jwt, { secret: env.JWT_SECRET });
await app.register(websocket);

app.decorate("authenticate", async (request: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply) => {
  try {
    const token = await request.jwtVerify<{ sub: string; email: string; role: "USER" | "ADMIN" }>();
    request.authUser = { id: token.sub, email: token.email, role: token.role };
  } catch {
    return reply.code(401).send({ message: "Authentication is required." });
  }
});

app.get("/health", async () => ({ ok: true, service: "virgocloud-api" }));
await authRoutes(app);
await dashboardRoutes(app);
await serverRoutes(app);
await fileRoutes(app);
await backupRoutes(app);
await nodeRoutes(app);
await adminRoutes(app);
await consoleRoutes(app);

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ZodError) return reply.code(400).send({ message: "Request validation failed.", issues: error.issues });
  const statusCode = (error as Error & { statusCode?: number }).statusCode ?? 500;
  if (statusCode >= 500) app.log.error(error);
  const message = error instanceof Error ? error.message : "Internal server error.";
  return reply.code(statusCode).send({ message });
});

await app.listen({ port: env.API_PORT, host: env.API_HOST });
