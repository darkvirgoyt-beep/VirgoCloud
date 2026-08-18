import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../env.js";

const key = Buffer.from(env.ENCRYPTION_KEY, "hex");

export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptSecret(payload: string): string {
  const [ivValue, tagValue, ciphertextValue] = payload.split(".");
  if (!ivValue || !tagValue || !ciphertextValue) throw new Error("Invalid encrypted node secret.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextValue, "base64url")), decipher.final()]).toString("utf8");
}

export function signAgentRequest(secret: string, method: string, path: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${method}\n${path}\n${timestamp}\n${body}`).digest("hex");
}

export function verifyAgentSignature(secret: string, method: string, path: string, timestamp: string, body: string, signature: string): boolean {
  if (Math.abs(Date.now() - Number(timestamp)) > 60_000) return false;
  const expected = signAgentRequest(secret, method, path, timestamp, body);
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
