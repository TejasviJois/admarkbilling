import { getAuthStatusFn } from "@/server/auth-fns";

let cached: { ok: boolean; at: number } | null = null;
const TTL_MS = 30_000;

export async function getAuthStatusCached(): Promise<{ ok: boolean }> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached;
  const status = await getAuthStatusFn();
  cached = { ok: status.ok, at: Date.now() };
  return status;
}

export function clearAuthStatusCache(): void {
  cached = null;
}
