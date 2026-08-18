import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { env } from "../env.js";

export const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
export const orchestrationQueue = new Queue("orchestration", { connection: redis });

export type ProvisionJob = { kind: "provision"; serverId: string };
export type BackupJob = { kind: "backup"; serverId: string; backupId?: string; requestedBy?: string };
export type CleanupJob = { kind: "cleanup"; serverId: string };
export type OrchestrationJob = ProvisionJob | BackupJob | CleanupJob;
