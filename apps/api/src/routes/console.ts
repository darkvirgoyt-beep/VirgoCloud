import type { FastifyInstance } from "fastify";
import { accessibleServer } from "../lib/access.js";
import { callAgent } from "../lib/agent-client.js";

export async function consoleRoutes(app: FastifyInstance) {
  app.get("/v1/servers/:serverId/console", { websocket: true }, (socket, request) => {
    const run = async () => {
      try {
        const token = (request.query as { token?: string }).token;
        if (!token) throw new Error("Console token required.");
        const user = await app.jwt.verify<{ sub: string; email: string; role: "USER" | "ADMIN" }>(token);
        request.authUser = { id: user.sub, email: user.email, role: user.role };
        const server = await accessibleServer(request, (request.params as { serverId: string }).serverId);
        if (!server.node) throw new Error("No node assigned.");
        socket.send(JSON.stringify({ type: "system", message: `Connected to ${server.name}. Console access is scoped to this container.` }));
        const timer = setInterval(async () => {
          try {
            const result = await callAgent<{ lines: string[] }>(server.node!, "GET", `/v1/servers/${server.id}/logs?containerName=${encodeURIComponent(server.containerName)}`);
            result.lines.forEach((line) => socket.send(JSON.stringify({ type: "log", line })));
          } catch { socket.send(JSON.stringify({ type: "system", message: "Waiting for node logs…" })); }
        }, 1500);
        socket.on("message", async (raw: Buffer) => {
          const value = JSON.parse(raw.toString()) as { type?: string; command?: string };
          if (value.type !== "command" || !value.command?.trim()) return;
          const result = await callAgent<{ output: string }>(server.node!, "POST", `/v1/servers/${server.id}/command`, { command: value.command.trim(), containerName: server.containerName });
          socket.send(JSON.stringify({ type: "output", line: result.output }));
        });
        socket.on("close", () => clearInterval(timer));
      } catch (error) {
        socket.send(JSON.stringify({ type: "error", message: error instanceof Error ? error.message : "Console authorization failed." }));
        socket.close();
      }
    };
    void run();
  });
}
