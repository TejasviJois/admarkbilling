/**
 * Single source of truth for APP_SESSION_SECRET resolution.
 * No Node crypto — safe to import from startup / session code that may be
 * evaluated in the Vite client graph.
 *
 * Crypto encrypt/decrypt lives in shared/encryption-core.mjs and re-exports this.
 */
export const MIN_SECRET_LENGTH = 16;
export const DEV_FALLBACK_SECRET =
  "admark-dev-only-session-secret-change-with-APP_SESSION_SECRET";

/**
 * Resolve the encryption / session secret.
 * In production a missing or too-short APP_SESSION_SECRET is a hard error —
 * never encrypt live client data with the publicly known development fallback.
 *
 * @param {{ APP_SESSION_SECRET?: string, NODE_ENV?: string }} [env]
 * @returns {string}
 */
export function resolveEncryptionSecret(env = process.env) {
  const secret = typeof env.APP_SESSION_SECRET === "string" ? env.APP_SESSION_SECRET.trim() : "";
  if (env.NODE_ENV === "production") {
    if (!secret || secret.length < MIN_SECRET_LENGTH) {
      throw new Error(
        "APP_SESSION_SECRET must be set (min 16 chars) in production — refusing to " +
          "encrypt/decrypt data with the development fallback key.",
      );
    }
    return secret;
  }
  return secret || DEV_FALLBACK_SECRET;
}
