const DEFAULT_USERNAME = "Admark Digitals";
const DEFAULT_PASSWORD = "HTRP@2026";

/** In-memory override hydrated from file / cloud on the server. */
let passwordOverride: string | undefined;
let overrideLoaded = false;

export function expectedUsername(): string {
  return process.env.ADMARK_APP_USERNAME?.trim() || DEFAULT_USERNAME;
}

export function expectedPassword(): string {
  if (passwordOverride?.trim()) return passwordOverride.trim();

  const env = process.env.ADMARK_APP_PASSWORD;
  if (process.env.NODE_ENV === "production") {
    if (!env?.trim()) {
      throw new Error(
        "ADMARK_APP_PASSWORD must be set in production (Vercel → Environment Variables).",
      );
    }
    return env;
  }
  return env ?? DEFAULT_PASSWORD;
}

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

export function credentialsValid(username: string, password: string): boolean {
  const userOk = normalizeUsername(username) === normalizeUsername(expectedUsername());
  const passOk = password === expectedPassword();
  return userOk && passOk;
}

/** Load file/cloud override once per server process (handlers only). */
export async function ensurePortalPasswordLoaded(): Promise<void> {
  if (overrideLoaded) return;
  overrideLoaded = true;
  try {
    const store = await import("./portal-auth-store");
    const fromFile = store.readPortalPasswordPlain();
    if (fromFile) {
      passwordOverride = fromFile;
      return;
    }
    const fromCloud = await store.readPortalPasswordFromCloud();
    if (fromCloud) {
      passwordOverride = fromCloud;
      // Mirror to local file so cold starts without another cloud round-trip still work.
      try {
        store.writePortalAuthOverride({ password: fromCloud });
      } catch {
        /* ignore */
      }
    }
  } catch {
    // Missing/unreadable override — fall back to env/defaults.
  }
}

/** Verify the current password, then persist a new portal password override. */
export async function setPortalPassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await ensurePortalPasswordLoaded();
  if (currentPassword !== expectedPassword()) {
    throw new Error("Current password is incorrect.");
  }
  const store = await import("./portal-auth-store");
  store.writePortalAuthOverride({ password: newPassword });
  await store.writePortalPasswordToCloud(newPassword);
  passwordOverride = newPassword.trim();
}
