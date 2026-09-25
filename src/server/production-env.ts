/**
 * Production env checks — server entry only (`src/server.ts`).
 * Never import this from client / `start.ts` (Vite empties process.env in the browser).
 */

const KNOWN_INSECURE = new Set([
  "HTRP@2026",
  "password",
  "Password1",
  "admin",
  "Admin@123",
  "12345678",
]);

let checked = false;

function env(name: string): string {
  return (typeof process !== "undefined" ? process.env[name] : undefined)?.trim() ?? "";
}

/** Soft warn once per isolate (missing vars). */
export function warnMissingProductionEnv(): void {
  if (checked || env("NODE_ENV") !== "production") return;
  checked = true;

  const missing: string[] = [];
  if (!env("SUPABASE_URL")) missing.push("SUPABASE_URL");
  if (!env("SUPABASE_SERVICE_ROLE_KEY")) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!env("APP_SESSION_SECRET")) missing.push("APP_SESSION_SECRET");
  if (!env("ADMARK_APP_PASSWORD")) missing.push("ADMARK_APP_PASSWORD");

  if (missing.length === 0) return;

  console.error(
    `[Admark Billing] Missing required production environment variables: ${missing.join(", ")}. ` +
      "Add them in Vercel → Project → Settings → Environment Variables (Production + Preview).",
  );
}

/** Hard fail at server boot when production secrets are missing or known-bad. */
export function assertProductionSecurityEnv(): void {
  if (env("NODE_ENV") !== "production") return;

  const password = env("ADMARK_APP_PASSWORD");
  const secret = env("APP_SESSION_SECRET");

  if (!secret || secret.length < 16) {
    throw new Error(
      "FATAL: APP_SESSION_SECRET must be set (min 16 chars) in production (Vercel → Environment Variables).",
    );
  }
  if (!password) {
    throw new Error(
      "FATAL: ADMARK_APP_PASSWORD must be set in production (Vercel → Environment Variables).",
    );
  }
  if (KNOWN_INSECURE.has(password)) {
    throw new Error(
      "FATAL: ADMARK_APP_PASSWORD is a known insecure default. Set a unique strong password.",
    );
  }
}
