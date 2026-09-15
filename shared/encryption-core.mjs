/**
 * AES-256-CBC encrypt/decrypt for app server code and plain `node scripts/*.mjs`.
 * Secret policy lives in encryption-secret.mjs (single fallback / production gate).
 *
 * Do not import this module from browser/client entrypoints — it uses node:crypto.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import {
  DEV_FALLBACK_SECRET,
  MIN_SECRET_LENGTH,
  resolveEncryptionSecret,
} from "./encryption-secret.mjs";

export { DEV_FALLBACK_SECRET, MIN_SECRET_LENGTH, resolveEncryptionSecret };

export const ALGORITHM = "aes-256-cbc";

/**
 * @param {{ APP_SESSION_SECRET?: string, NODE_ENV?: string }} [env]
 * @returns {Buffer}
 */
export function deriveEncryptionKey(env = process.env) {
  return createHash("sha256").update(resolveEncryptionSecret(env)).digest();
}

/**
 * @param {string} text
 * @param {{ APP_SESSION_SECRET?: string, NODE_ENV?: string }} [env]
 * @returns {string}
 */
export function encrypt(text, env = process.env) {
  if (!text) return text;
  // Resolve the key outside try/catch: a missing production secret must
  // propagate as a hard failure, never silently store plaintext.
  const key = deriveEncryptionKey(env);
  try {
    const iv = randomBytes(16);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    return iv.toString("hex") + ":" + encrypted;
  } catch (err) {
    console.error("Encryption error:", err);
    throw new Error(
      `Encryption failed — refusing to store plaintext. ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * @param {string} encryptedText
 * @param {{ APP_SESSION_SECRET?: string, NODE_ENV?: string }} [env]
 * @returns {string}
 */
export function decrypt(encryptedText, env = process.env) {
  if (!encryptedText || !String(encryptedText).includes(":")) return encryptedText;
  // Same rationale as encrypt(): key resolution failures must not be
  // swallowed by the legacy-plaintext fallback below.
  const key = deriveEncryptionKey(env);
  try {
    const parts = String(encryptedText).split(":");
    const ivHex = parts[0];
    const ciphertext = parts[1];
    if (!/^[0-9a-f]{32}$/i.test(ivHex) || !/^[0-9a-f]+$/i.test(ciphertext)) {
      return encryptedText;
    }
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
    let decrypted = decipher.update(ciphertext, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return encryptedText;
  }
}
