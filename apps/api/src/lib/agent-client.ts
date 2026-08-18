import { decryptSecret, signAgentRequest } from "./crypto.js";

type AgentNode = { agentUrl: string; secretCiphertext: string };

export async function callAgent<T>(node: AgentNode, method: "GET" | "POST" | "PUT" | "DELETE", path: string, payload?: unknown): Promise<T> {
  const body = payload === undefined ? "" : JSON.stringify(payload);
  const timestamp = Date.now().toString();
  const secret = decryptSecret(node.secretCiphertext);
  const response = await fetch(`${node.agentUrl.replace(/\/$/, "")}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-vc-timestamp": timestamp,
      "x-vc-signature": signAgentRequest(secret, method, path, timestamp, body)
    },
    body: body || undefined,
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`Node agent request failed (${response.status}): ${await response.text()}`);
  return response.json() as Promise<T>;
}
