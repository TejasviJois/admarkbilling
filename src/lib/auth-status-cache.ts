import { getAuthStatusFn } from "@/server/auth-fns";

let cached: { ok: boolean; at: number } | null = null;
const TTL_MS = 60_000;

// Module state on the server is shared across requests (and users), so a
// stale entry from one visitor would leak into everyone's SSR auth checks.
const canCache = typeof window !== "undefined";

export async function getAuthStatusCached(): Promise<{ ok: boolean }> {
  if (canCache && cached && Date.now() - cached.at < TTL_MS) return cached;
  const status = await getAuthStatusFn();
  if (canCache) cached = { ok: status.ok, at: Date.now() };
  return status;
}

export function clearAuthStatusCache(): void {
  cached = null;
}
