import Fastify from "fastify";
import cors from "@fastify/cors";
import systeminformation from "systeminformation";
import { z } from "zod";
import { env } from "./env.js";
import { archiveAndUpload, deleteFile, getFile, listFiles, provisionServer, restoreArchive, serverAction, serverLogs, terminalCommand, putFile, uploadFile } from "./lib/docker.js";
import { assertValidSignature, safeRelativePath } from "./lib/security.js";
import { createHmac } from "node:crypto";

const app = Fastify({ logger: true });
await app.register(cors, { origin: false });

app.addHook("preHandler", async (request, reply) => {
  if (request.url === "/health") return;
  try { assertValidSignature(request.method, request.url.split("?")[0], request.headers["x-vc-timestamp"] as string | undefined, request.body === undefined ? "" : JSON.stringify(request.body), request.headers["x-vc-signature"] as string | undefined); }
  catch (error) { return reply.code(401).send({ message: error instanceof Error ? error.message : "Unauthorized." }); }
});

const serverParams = z.object({ serverId: z.string().min(8).max(64) });
const containerSchema = z.object({ containerName: z.string() });

app.get("/health", async () => ({ ok: true, version: "0.1.0" }));
app.post("/v1/enroll", async () => ({ version: "0.1.0" }));
app.post("/v1/servers/:serverId/provision", async (request) => provisionServer(serverParams.parse(request.params).serverId, z.object({ containerName: z.string(), edition: z.enum(["JAVA", "BEDROCK"]), version: z.string(), software: z.string(), ramMb: z.number().int(), playerSlots: z.number().int(), difficulty: z.string(), gameMode: z.string() }).parse(request.body)));
app.post("/v1/servers/:serverId/actions", async (request) => { const input = containerSchema.extend({ action: z.enum(["start", "stop", "restart", "kill"]) }).parse(request.body); return serverAction(serverParams.parse(request.params).serverId, input.containerName, input.action); });
app.get("/v1/servers/:serverId/logs", async (request) => { const query = containerSchema.parse(request.query); return serverLogs(serverParams.parse(request.params).serverId, query.containerName); });
app.post("/v1/servers/:serverId/command", async (request) => { const input = containerSchema.extend({ command: z.string().min(1).max(1000) }).parse(request.body); return terminalCommand(serverParams.parse(request.params).serverId, input.containerName, input.command); });
app.get("/v1/servers/:serverId/files", async (request) => listFiles(serverParams.parse(request.params).serverId, z.object({ path: z.string().optional() }).parse(request.query).path));
app.get("/v1/servers/:serverId/file", async (request) => { const path = safeRelativePath(z.object({ path: z.string() }).parse(request.query).path); return getFile(serverParams.parse(request.params).serverId, path); });
app.put("/v1/servers/:serverId/file", async (request) => { const input = z.object({ path: z.string(), content: z.string().max(1024 * 1024) }).parse(request.body); return putFile(serverParams.parse(request.params).serverId, safeRelativePath(input.path), input.content); });
app.post("/v1/servers/:serverId/upload", async (request) => { const input = z.object({ path: z.string(), contentBase64: z.string().min(1).max(70 * 1024 * 1024) }).parse(request.body); return uploadFile(serverParams.parse(request.params).serverId, safeRelativePath(input.path), input.contentBase64); });
app.delete("/v1/servers/:serverId/file", async (request) => { const path = safeRelativePath(z.object({ path: z.string() }).parse(request.query).path); return deleteFile(serverParams.parse(request.params).serverId, path); });
app.post("/v1/servers/:serverId/backup", async (request) => { const input = containerSchema.extend({ uploadUrl: z.string().url() }).parse(request.body); return archiveAndUpload(serverParams.parse(request.params).serverId, input.containerName, input.uploadUrl); });
app.post("/v1/servers/:serverId/restore", async (request) => { const input = containerSchema.extend({ downloadUrl: z.string().url() }).parse(request.body); return restoreArchive(serverParams.parse(request.params).serverId, input.containerName, input.downloadUrl); });

async function heartbeat() {
  const [cpu, mem, disk, containers] = await Promise.all([systeminformation.currentLoad(), systeminformation.mem(), systeminformation.fsSize(), (await import("./lib/docker.js")).docker.listContainers({ all: false, filters: { label: ["virgocloud.managed=true"] } })]);
  const data = { cpuPercent: cpu.currentLoad, ramUsedMb: Math.round(mem.active / 1024 / 1024), ramTotalMb: Math.round(mem.total / 1024 / 1024), diskUsedGb: Math.round((disk[0]?.used ?? 0) / 1024 / 1024 / 1024 * 100) / 100, diskTotalGb: Math.round((disk[0]?.size ?? 0) / 1024 / 1024 / 1024 * 100) / 100, runningServers: containers.length, version: "0.1.0" };
  const body = JSON.stringify(data);
  const timestamp = Date.now().toString();
  const path = `/v1/nodes/${env.AGENT_NODE_ID}/heartbeat`;
  const signature = createHmac("sha256", env.AGENT_SHARED_SECRET).update(`POST\n${path}\n${timestamp}\n${body}`).digest("hex");
  await fetch(`${env.CONTROL_PLANE_URL.replace(/\/$/, "")}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-vc-timestamp": timestamp, "x-vc-signature": signature }, body });
}

setInterval(() => { void heartbeat().catch((error) => app.log.warn(error, "Node heartbeat failed")); }, 30_000);
void heartbeat().catch((error) => app.log.warn(error, "Initial node heartbeat failed"));
await app.listen({ host: env.AGENT_HOST, port: env.AGENT_PORT });
