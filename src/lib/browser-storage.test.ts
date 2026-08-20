import { afterEach, describe, expect, it, vi } from "vitest";
import { isQuotaExceededError, safeLocalStorageSet } from "./browser-storage";

function installStorage(mock: Storage) {
  vi.stubGlobal("window", { localStorage: mock });
  vi.stubGlobal("localStorage", mock);
}

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    get length() {
      return store.size;
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    getItem: (key: string) => store.get(key) ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  } as Storage;
}

describe("browser storage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("detects quota errors from WebKit-style messages", () => {
    expect(isQuotaExceededError(new Error("The quota has been exceeded."))).toBe(true);
    expect(isQuotaExceededError(new Error("Unauthorized"))).toBe(false);
  });

  it("does not throw when localStorage is full", () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new Error("The quota has been exceeded.");
    };
    installStorage(storage);

    expect(() => safeLocalStorageSet("admark.operations", "{}")).not.toThrow();
    expect(safeLocalStorageSet("admark.operations", "{}")).toBe(false);
  });

  it("retries after dropping backup copies", () => {
    const store = new Map<string, string>([["admark.operations.backup.1", "old"]]);
    const storage = {
      get length() {
        return store.size;
      },
      key: (index: number) => [...store.keys()][index] ?? null,
      getItem: (key: string) => store.get(key) ?? null,
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
      setItem: (key: string, value: string) => {
        if (store.has("admark.operations.backup.1")) {
          throw new Error("The quota has been exceeded.");
        }
        store.set(key, value);
      },
    } as Storage;
    installStorage(storage);

    expect(safeLocalStorageSet("admark.operations", "{}")).toBe(true);
    expect(store.get("admark.operations")).toBe("{}");
    expect(store.has("admark.operations.backup.1")).toBe(false);
  });
});
