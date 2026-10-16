import { LRUCache } from "lru-cache";

const TTL_MS = 60_000;
const MAX_ENTRIES = 64;

/** lru-cache requires the value type to be non-nullish; cast at the get/set boundary. */
type CacheValue = NonNullable<unknown>;

const store = new LRUCache<string, CacheValue>({
  max: MAX_ENTRIES,
  ttl: TTL_MS,
});

export function cacheGet<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

export function cacheSet<T>(key: string, value: T): void {
  if (value == null) {
    store.delete(key);
    return;
  }
  store.set(key, value as CacheValue);
}

export function cacheDel(key: string): void {
  store.delete(key);
}

export function cacheDelPrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

const inFlight = new Map<string, Promise<unknown>>();

export async function cacheThrough<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== undefined) return hit;

  let existing = inFlight.get(key) as Promise<T> | undefined;
  if (!existing) {
    existing = loader()
      .then((value) => {
        cacheSet(key, value);
        return value;
      })
      .finally(() => {
        inFlight.delete(key);
      });
    inFlight.set(key, existing);
  }
  return existing;
}

export const CACHE_KEYS = {
  operations: "ops:default",
  documents: "docs:default",
  company: "company:default",
  invoices: "invoices:list",
} as const;
