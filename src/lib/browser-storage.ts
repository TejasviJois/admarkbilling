import { logClientError } from "./client-logger";

export function isQuotaExceededError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return (
      error.name === "QuotaExceededError" ||
      error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      error.code === 22
    );
  }
  return error instanceof Error && /quota/i.test(error.message);
}

function evictLocalBackups(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  const stale: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.includes(".backup.")) stale.push(key);
  }
  for (const key of stale) localStorage.removeItem(key);
}

/** Write localStorage without throwing. Phone Safari quota must never block a cloud save. */
export function safeLocalStorageSet(key: string, value: string): boolean {
  if (typeof window === "undefined" || !window.localStorage) return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (!isQuotaExceededError(error)) {
      logClientError("browser-storage.set", error);
      return false;
    }
    evictLocalBackups();
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }
}
