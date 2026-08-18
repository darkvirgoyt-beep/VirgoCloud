import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env.js";
import { isSafeRelativePath, isSafeServerId } from "./validation.js";

export function assertValidSignature(method: string, path: string, timestamp: string | undefined, rawBody: string, signature: string | undefined) {
  if (!timestamp || !signature || Math.abs(Date.now() - Number(timestamp)) > 60_000) throw new Error("Stale or missing agent signature.");
  const expected = createHmac("sha256", env.AGENT_SHARED_SECRET).update(`${method}\n${path}\n${timestamp}\n${rawBody}`).digest("hex");
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) throw new Error("Invalid agent signature.");
}

export function safeServerId(value: string): string {
  if (!isSafeServerId(value)) throw new Error("Invalid server identifier.");
  return value;
}

export function safeContainerName(value: string): string {
  if (!/^vc-[a-f0-9]{16,64}$/.test(value)) throw new Error("Invalid managed container name.");
  return value;
}

export function safeRelativePath(value: string): string {
  if (!isSafeRelativePath(value)) throw new Error("Path escapes the server data directory.");
  return value;
}
