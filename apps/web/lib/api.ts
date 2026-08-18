export type User = { id: string; email: string; name?: string | null; role: "USER" | "ADMIN" };
export type Server = { id: string; name: string; edition: "JAVA" | "BEDROCK"; version: string; software: string; ramMb: number; playerSlots: number; difficulty: string; gameMode: string; status: string; host?: string | null; port?: number | null; metrics?: Array<{ cpuPercent: number; ramUsedMb: number; storageUsedGb: number; playersOnline: number }>; node?: { name: string; region?: string | null } };

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
export const authStore = {
  get: () => typeof window === "undefined" ? null : window.localStorage.getItem("vc_token"),
  set: (token: string) => window.localStorage.setItem("vc_token", token),
  clear: () => window.localStorage.removeItem("vc_token")
};

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = authStore.get();
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...options.headers } });
  const payload = await response.json().catch(() => ({ message: "Network request failed." }));
  if (!response.ok) throw new Error(payload.message ?? "Request failed.");
  return payload as T;
}

export { baseUrl };
