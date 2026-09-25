import { getAuthStatusFn, type AuthStatus } from "@/server/auth-fns";

let cached: (AuthStatus & { at: number }) | null = null;
const TTL_MS = 60_000;

// Module state on the server is shared across requests (and users), so a
// stale entry from one visitor would leak into everyone's SSR auth checks.
const canCache = typeof window !== "undefined";

export async function getAuthStatusCached(): Promise<AuthStatus> {
  if (canCache && cached && Date.now() - cached.at < TTL_MS) {
    const { at: _at, ...status } = cached;
    return status;
  }
  const status = await getAuthStatusFn();
  if (canCache) cached = { ...status, at: Date.now() };
  return status;
}

/** Sync read of a still-fresh cache entry (no network). */
export function peekAuthStatusCache(): AuthStatus | null {
  if (!canCache || !cached || Date.now() - cached.at >= TTL_MS) return null;
  const { at: _at, ...status } = cached;
  return status;
}

/** Seed cache after login so the shell can render the correct nav immediately. */
export function setAuthStatusCache(status: AuthStatus): void {
  if (!canCache) return;
  cached = { ...status, at: Date.now() };
}

export function clearAuthStatusCache(): void {
  cached = null;
}
