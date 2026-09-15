const DEFAULT_USERNAME = "Admark Digitals";

/** Passwords that must never be used in production (and are refused as env defaults). */
export const KNOWN_INSECURE_PASSWORDS = [
  "HTRP@2026",
  "password",
  "Password1",
  "12345678",
] as const;

/** In-memory override hydrated from file / cloud on the server. */
let passwordOverride: string | undefined;
let overrideLoaded = false;

function readEnv(name: string): string | undefined {
  // Dynamic key — avoids Vite replacing process.env.NAME with undefined in bundles.
  const value = typeof process !== "undefined" ? process.env[name] : undefined;
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || undefined;
}

export function expectedUsername(): string {
  return readEnv("ADMARK_APP_USERNAME") || DEFAULT_USERNAME;
}

export function isKnownInsecurePassword(password: string): boolean {
  const normalized = password.trim();
  return KNOWN_INSECURE_PASSWORDS.some((p) => p === normalized);
}

export function expectedPassword(): string {
  if (passwordOverride?.trim()) {
    const override = passwordOverride.trim();
    if (readEnv("NODE_ENV") === "production" && isKnownInsecurePassword(override)) {
      throw new Error(
        "Portal password override is a known insecure default. Change it in Settings.",
      );
    }
    return override;
  }

  const fromEnv = readEnv("ADMARK_APP_PASSWORD");
  if (!fromEnv) {
    throw new Error(
      "ADMARK_APP_PASSWORD must be set (Vercel / .env). Hardcoded defaults were removed.",
    );
  }
  if (readEnv("NODE_ENV") === "production" && isKnownInsecurePassword(fromEnv)) {
    throw new Error(
      "ADMARK_APP_PASSWORD must not be a known insecure default (e.g. HTRP@2026).",
    );
  }
  return fromEnv;
}

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

export function credentialsValid(username: string, password: string): boolean {
  const userOk = normalizeUsername(username) === normalizeUsername(expectedUsername());
  let passOk = false;
  try {
    passOk = timingSafeEqual(password, expectedPassword());
  } catch {
    passOk = false;
  }
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
      try {
        store.writePortalAuthOverride({ password: fromCloud });
      } catch {
        /* ignore */
      }
    }
  } catch {
    // Missing/unreadable override — fall back to env.
  }
}

/** Verify the current password, then persist a new portal password override. */
export async function setPortalPassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await ensurePortalPasswordLoaded();
  if (!timingSafeEqual(currentPassword, expectedPassword())) {
    throw new Error("Current password is incorrect.");
  }
  if (isKnownInsecurePassword(newPassword)) {
    throw new Error("Choose a stronger password — that value is a known insecure default.");
  }
  const store = await import("./portal-auth-store");
  store.writePortalAuthOverride({ password: newPassword });
  await store.writePortalPasswordToCloud(newPassword);
  passwordOverride = newPassword.trim();
}
