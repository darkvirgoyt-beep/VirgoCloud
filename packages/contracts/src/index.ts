import { z } from "zod";

export const userRoleSchema = z.enum(["USER", "ADMIN"]);
export const minecraftEditionSchema = z.enum(["JAVA", "BEDROCK"]);
export const serverStatusSchema = z.enum(["PROVISIONING", "OFFLINE", "STARTING", "RUNNING", "STOPPING", "ERROR", "SUSPENDED"]);
export const desiredServerStateSchema = z.enum(["RUNNING", "STOPPED"]);
export const nodeTypeSchema = z.enum(["LOCAL", "DOCKER_HOST", "CLOUD_VM", "EXTERNAL"]);
export const serverActionSchema = z.enum(["start", "stop", "restart", "kill"]);
export const difficultySchema = z.enum(["peaceful", "easy", "normal", "hard"]);
export const gameModeSchema = z.enum(["survival", "creative", "adventure", "spectator"]);

export const createServerSchema = z.object({
  name: z.string().trim().min(3).max(48).regex(/^[a-zA-Z0-9 _-]+$/, "Use letters, numbers, spaces, underscores, or hyphens."),
  edition: minecraftEditionSchema,
  version: z.string().trim().min(1).max(32),
  ramMb: z.number().int().min(1024).max(32768),
  playerSlots: z.number().int().min(1).max(500),
  difficulty: difficultySchema,
  gameMode: gameModeSchema,
  software: z.string().trim().min(1).max(32).default("VANILLA"),
  nodeId: z.string().cuid().optional()
});

export const updateServerSchema = createServerSchema.partial().omit({ nodeId: true }).extend({ desiredState: desiredServerStateSchema.optional() });

export const filePathSchema = z.string().trim().min(1).max(255).refine(
  (value) => !value.startsWith("/") && !value.split("/").includes("..") && !value.includes("\\"),
  "Path must remain inside the server data directory."
);

export const terminalCommandSchema = z.object({
  command: z.string().trim().min(1).max(1000)
});

export const backupScheduleSchema = z.object({
  intervalHours: z.number().int().min(1).max(168),
  retentionCount: z.number().int().min(1).max(100)
});

export const nodeEnrollmentSchema = z.object({
  name: z.string().trim().min(3).max(64),
  type: nodeTypeSchema,
  agentUrl: z.string().url().refine((url) => url.startsWith("https://") || url.startsWith("http://localhost"), "Node agent must use HTTPS outside localhost."),
  region: z.string().trim().min(2).max(64).optional()
});

export const agentHeartbeatSchema = z.object({
  cpuPercent: z.number().min(0).max(100),
  ramUsedMb: z.number().int().nonnegative(),
  ramTotalMb: z.number().int().positive(),
  diskUsedGb: z.number().nonnegative(),
  diskTotalGb: z.number().positive(),
  runningServers: z.number().int().nonnegative(),
  version: z.string().max(32)
});

export type CreateServerInput = z.infer<typeof createServerSchema>;
export type BackupScheduleInput = z.infer<typeof backupScheduleSchema>;
export type AgentHeartbeat = z.infer<typeof agentHeartbeatSchema>;
