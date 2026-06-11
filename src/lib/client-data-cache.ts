/** Browser session cache — instant stale-while-revalidate (CDN-like on the client). */
const PREFIX = "admark.cache.v1:";
const TTL_MS = 5 * 60_000;

type Entry<T> = { v: T; at: number };

function isBrowser() {
  return typeof window !== "undefined" && typeof sessionStorage !== "undefined";
}

export function readClientCache<T>(key: string): T | undefined {
  if (!isBrowser()) return undefined;
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (!raw) return undefined;
    const entry = JSON.parse(raw) as Entry<T>;
    if (Date.now() - entry.at > TTL_MS) {
      sessionStorage.removeItem(PREFIX + key);
      return undefined;
    }
    return entry.v;
  } catch {
    return undefined;
  }
}

export function writeClientCache<T>(key: string, value: T): void {
  if (!isBrowser()) return;
  try {
    const entry: Entry<T> = { v: value, at: Date.now() };
    sessionStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    /* quota exceeded — ignore */
  }
}

export function clearClientCache(key: string): void {
  if (!isBrowser()) return;
  sessionStorage.removeItem(PREFIX + key);
}
