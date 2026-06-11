import { LRUCache } from "lru-cache";

const TTL_MS = 60_000;
const MAX_ENTRIES = 64;

const store = new LRUCache<string, unknown>({
  max: MAX_ENTRIES,
  ttl: TTL_MS,
});

export function cacheGet<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

export function cacheSet<T>(key: string, value: T): void {
  store.set(key, value);
}

export function cacheDel(key: string): void {
  store.delete(key);
}

export function cacheDelPrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export async function cacheThrough<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== undefined) return hit;
  const value = await loader();
  cacheSet(key, value);
  return value;
}

export const CACHE_KEYS = {
  operations: "ops:default",
  documents: "docs:default",
  company: "company:default",
  invoices: "invoices:list",
} as const;
