import Docker from "dockerode";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { promisify } from "node:util";
import { env } from "../env.js";
import { safeContainerName, safeRelativePath, safeServerId } from "./security.js";

export const docker = new Docker({ socketPath: env.DOCKER_SOCKET });

export function serverRoot(serverId: string) {
  const root = resolve(env.SERVER_DATA_ROOT);
  const target = resolve(root, safeServerId(serverId));
  if (!target.startsWith(`${root}/`)) throw new Error("Unsafe server root.");
  return target;
}

function fileTarget(serverId: string, path: string) {
  const root = serverRoot(serverId);
  const target = resolve(root, safeRelativePath(path));
  if (!target.startsWith(`${root}/`)) throw new Error("Unsafe file path.");
  return target;
}

async function managedContainer(serverId: string, containerName: string) {
  const container = docker.getContainer(safeContainerName(containerName));
  const details = await container.inspect();
  if (details.Config.Labels?.["virgocloud.serverId"] !== safeServerId(serverId)) throw new Error("Container does not belong to the requested server.");
  return { container, details };
}

const run = (command: string, args: string[]) => new Promise<{ stdout: Buffer; stderr: Buffer }>((resolvePromise, reject) => {
  const child = spawn(command, args);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on("data", (data) => stdout.push(Buffer.from(data)));
  child.stderr.on("data", (data) => stderr.push(Buffer.from(data)));
  child.on("error", reject);
  child.on("close", (code) => code === 0 ? resolvePromise({ stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) }) : reject(new Error(`${command} failed: ${Buffer.concat(stderr).toString("utf8")}`)));
});

export async function provisionServer(serverId: string, input: { containerName: string; edition: "JAVA" | "BEDROCK"; version: string; software: string; ramMb: number; playerSlots: number; difficulty: string; gameMode: string }) {
  const root = serverRoot(serverId);
  await mkdir(root, { recursive: true, mode: 0o750 });
  const name = safeContainerName(input.containerName);
  const image = input.edition === "JAVA" ? "itzg/minecraft-server:java21" : "itzg/minecraft-bedrock-server:latest";
  const envVars = input.edition === "JAVA"
    ? [`EULA=TRUE`, `VERSION=${input.version}`, `TYPE=${input.software}`, `MEMORY=${input.ramMb}M`, `MAX_PLAYERS=${input.playerSlots}`, `DIFFICULTY=${input.difficulty}`, `MODE=${input.gameMode}`, `ENABLE_RCON=true`, `RCON_PASSWORD=${serverId}`]
    : [`EULA=TRUE`, `VERSION=${input.version}`, `SERVER_NAME=${name}`, `MAX_PLAYERS=${input.playerSlots}`, `DIFFICULTY=${input.difficulty}`, `GAMEMODE=${input.gameMode}`];
  const existing = docker.getContainer(name);
  try { await existing.inspect(); return { status: "OFFLINE" as const }; } catch { /* managed container not yet created */ }
  const gamePort = input.edition === "JAVA" ? "25565/tcp" : "19132/udp";
  const container = await docker.createContainer({
    name,
    Image: image,
    Env: envVars,
    Labels: { "virgocloud.managed": "true", "virgocloud.serverId": serverId },
    HostConfig: {
      Memory: input.ramMb * 1024 * 1024,
      MemorySwap: input.ramMb * 1024 * 1024,
      Binds: [`${root}:/data`],
      RestartPolicy: { Name: "unless-stopped" },
      NetworkMode: "bridge",
      PortBindings: { [gamePort]: [{ HostPort: "" }] },
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges:true"],
      PidsLimit: 512
    },
    ExposedPorts: { [gamePort]: {} }
  });
  const details = await container.inspect();
  const binding = details.NetworkSettings.Ports[gamePort]?.[0];
  return { status: "OFFLINE" as const, host: env.AGENT_PUBLIC_HOST, port: binding ? Number(binding.HostPort) : undefined };
}

export async function serverAction(serverId: string, containerName: string, action: "start" | "stop" | "restart" | "kill") {
  const { container } = await managedContainer(serverId, containerName);
  if (action === "start") await container.start();
  if (action === "stop") await container.stop({ t: 30 });
  if (action === "restart") await container.restart({ t: 30 });
  if (action === "kill") await container.kill();
  const details = await container.inspect();
  return { status: details.State.Running ? "RUNNING" : "OFFLINE" };
}

export async function serverLogs(serverId: string, containerName: string) {
  const { container } = await managedContainer(serverId, containerName);
  const raw = await container.logs({ stdout: true, stderr: true, tail: 100, timestamps: true });
  return { lines: raw.toString("utf8").split("\n").filter(Boolean).map((line) => line.replace(/^.{8}/, "")) };
}

const blockedShell = /(;|&&|\|\||\||`|\$\(|>|<|\n|\r|\/proc|\/sys|sudo|apt|curl|wget|nc|ssh|chmod|chown|mount|docker)/i;
const allowedShell = /^(ls(?:\s+[\w./-]+)?|pwd|cat\s+[\w./-]+|find\s+[\w./-]+(?:\s+-maxdepth\s+\d+)?|java\s+-version|screen\s+-ls|help)$/;

export async function terminalCommand(serverId: string, containerName: string, command: string) {
  const { container } = await managedContainer(serverId, containerName);
  const trimmed = command.trim();
  if (trimmed.startsWith("/")) {
    const result = await container.exec({ Cmd: ["rcon-cli", trimmed.slice(1)], AttachStdout: true, AttachStderr: true }).then(async (exec) => {
      const stream = await exec.start({ hijack: true, stdin: false });
      const output: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => output.push(chunk));
      await new Promise<void>((resolvePromise) => stream.on("end", () => resolvePromise()));
      return Buffer.concat(output).toString("utf8");
    });
    return { output: result || "Command submitted to Minecraft." };
  }
  if (blockedShell.test(trimmed) || !allowedShell.test(trimmed)) return { output: "Command blocked. This terminal permits only scoped, read-only shell inspection commands; edit files through the file manager." };
  const exec = await container.exec({ Cmd: ["sh", "-lc", `cd /data && ${trimmed}`], AttachStdout: true, AttachStderr: true });
  const stream = await exec.start({ hijack: true, stdin: false });
  const output: Buffer[] = [];
  stream.on("data", (chunk: Buffer) => output.push(chunk));
  await new Promise<void>((resolvePromise) => stream.on("end", () => resolvePromise()));
  return { output: Buffer.concat(output).toString("utf8") || "Done." };
}

export async function listFiles(serverId: string, path = "") {
  const target = path ? fileTarget(serverId, path) : serverRoot(serverId);
  const entries = await readdir(target, { withFileTypes: true });
  return Promise.all(entries.map(async (entry) => {
    const relative = path ? `${path}/${entry.name}` : entry.name;
    const entryStat = await stat(join(target, entry.name));
    return { name: entry.name, path: relative, isDirectory: entry.isDirectory(), sizeBytes: entryStat.size, updatedAt: entryStat.mtime.toISOString() };
  }));
}

export async function getFile(serverId: string, path: string) { return { path, content: await readFile(fileTarget(serverId, path), "utf8") }; }
export async function putFile(serverId: string, path: string, content: string) { const target = fileTarget(serverId, path); await mkdir(resolve(target, ".."), { recursive: true, mode: 0o750 }); await writeFile(target, content, { encoding: "utf8", mode: 0o640 }); return { sizeBytes: Buffer.byteLength(content) }; }
export async function uploadFile(serverId: string, path: string, contentBase64: string) { const target = fileTarget(serverId, path); const contents = Buffer.from(contentBase64, "base64"); await mkdir(resolve(target, ".."), { recursive: true, mode: 0o750 }); await writeFile(target, contents, { mode: 0o640 }); return { sizeBytes: contents.length }; }
export async function deleteFile(serverId: string, path: string) { await rm(fileTarget(serverId, path), { recursive: true, force: true }); return { ok: true }; }

export async function archiveAndUpload(serverId: string, _containerName: string, uploadUrl: string) {
  const root = serverRoot(serverId);
  const archive = join("/tmp", `virgocloud-${serverId}-${Date.now()}.tar.gz`);
  await run("tar", ["-C", root, "-czf", archive, "."]);
  const payload = await readFile(archive);
  const response = await fetch(uploadUrl, { method: "PUT", body: payload, headers: { "content-type": "application/gzip", "content-length": payload.length.toString() } });
  await rm(archive, { force: true });
  if (!response.ok) throw new Error(`Backup archive upload failed: ${response.status}`);
  return { sizeBytes: payload.length, checksum: (await import("node:crypto")).createHash("sha256").update(payload).digest("hex") };
}

export async function restoreArchive(serverId: string, containerName: string, downloadUrl: string) {
  const { container } = await managedContainer(serverId, containerName);
  const root = serverRoot(serverId);
  const archive = join("/tmp", `virgocloud-restore-${serverId}-${Date.now()}.tar.gz`);
  const response = await fetch(downloadUrl);
  if (!response.ok) throw new Error("Backup archive download failed.");
  await writeFile(archive, Buffer.from(await response.arrayBuffer()), { mode: 0o600 });
  const wasRunning = (await container.inspect()).State.Running;
  if (wasRunning) await container.stop({ t: 30 });
  try { await run("tar", ["-C", root, "-xzf", archive, "--no-same-owner", "--no-same-permissions"]); } finally { await rm(archive, { force: true }); if (wasRunning) await container.start(); }
  return { ok: true };
}
