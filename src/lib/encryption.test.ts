import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEV_FALLBACK_SECRET,
  decrypt,
  encrypt,
  resolveEncryptionSecret,
} from "./encryption";
import {
  decrypt as coreDecrypt,
  encrypt as coreEncrypt,
  resolveEncryptionSecret as coreResolve,
} from "../../shared/encryption-core.mjs";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("encryption secret resolution", () => {
  it("throws in production when APP_SESSION_SECRET is missing", () => {
    expect(() =>
      resolveEncryptionSecret({ NODE_ENV: "production", APP_SESSION_SECRET: undefined }),
    ).toThrow(/APP_SESSION_SECRET/);
  });

  it("throws in production when the secret is blank or too short", () => {
    expect(() =>
      resolveEncryptionSecret({ NODE_ENV: "production", APP_SESSION_SECRET: "   " }),
    ).toThrow(/APP_SESSION_SECRET/);
    expect(() =>
      resolveEncryptionSecret({ NODE_ENV: "production", APP_SESSION_SECRET: "short" }),
    ).toThrow(/APP_SESSION_SECRET/);
  });

  it("uses the configured secret in production", () => {
    expect(
      resolveEncryptionSecret({
        NODE_ENV: "production",
        APP_SESSION_SECRET: "a-strong-production-secret",
      }),
    ).toBe("a-strong-production-secret");
  });

  it("falls back to the dev key only outside production", () => {
    const secret = resolveEncryptionSecret({ NODE_ENV: "development" });
    expect(secret).toBe(DEV_FALLBACK_SECRET);
  });

  it("encrypt() refuses to run in production without a secret (no plaintext leak)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_SESSION_SECRET", "");
    expect(() => encrypt("sensitive client data")).toThrow(/APP_SESSION_SECRET/);
  });

  it("decrypt() refuses to run in production without a secret", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_SESSION_SECRET", "");
    expect(() => decrypt("deadbeef:cafebabe")).toThrow(/APP_SESSION_SECRET/);
  });

  it("round-trips data with a configured production secret", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_SESSION_SECRET", "a-strong-production-secret");
    const cipherText = encrypt("9876543210");
    expect(cipherText).not.toBe("9876543210");
    expect(decrypt(cipherText)).toBe("9876543210");
  });
});

describe("shared encryption-core single source of truth", () => {
  it("app wrappers and shared core agree on secret policy", () => {
    const env = { NODE_ENV: "development" as const };
    expect(resolveEncryptionSecret(env)).toBe(coreResolve(env));
    expect(() =>
      resolveEncryptionSecret({ NODE_ENV: "production", APP_SESSION_SECRET: "" }),
    ).toThrow(/APP_SESSION_SECRET/);
    expect(() => coreResolve({ NODE_ENV: "production", APP_SESSION_SECRET: "" })).toThrow(
      /APP_SESSION_SECRET/,
    );
  });

  it("app encrypt/decrypt delegates to the shared core (same ciphertext format)", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_SESSION_SECRET", "test-shared-secret-16chars");
    const fromCore = coreEncrypt("shared-roundtrip");
    expect(coreDecrypt(fromCore)).toBe("shared-roundtrip");
    expect(decrypt(fromCore)).toBe("shared-roundtrip");
  });

  it("DEV_FALLBACK_SECRET string literal exists only in shared/encryption-secret.mjs", () => {
    const root = resolve(process.cwd());
    const secretMod = readFileSync(resolve(root, "shared/encryption-secret.mjs"), "utf8");
    expect(secretMod).toContain(DEV_FALLBACK_SECRET);

    const filesThatMustNotContainFallback = [
      "shared/encryption-core.mjs",
      "src/lib/encryption.ts",
      "src/server/app-session.ts",
      "src/start.ts",
      "scripts/migrate-json-to-relational.mjs",
      "scripts/import-directory-contacts.mjs",
      "scripts/verify-full-restore.mjs",
      "scripts/full-restore-from-backup.mjs",
    ];
    for (const rel of filesThatMustNotContainFallback) {
      const body = readFileSync(resolve(root, rel), "utf8");
      expect(body, rel).not.toContain(DEV_FALLBACK_SECRET);
    }
  });

  it("start.ts and app-session import crypto-free secret module only", () => {
    const start = readFileSync(resolve(process.cwd(), "src/start.ts"), "utf8");
    const session = readFileSync(resolve(process.cwd(), "src/server/app-session.ts"), "utf8");
    expect(start).toMatch(/encryption-secret\.mjs/);
    expect(start).not.toMatch(/encryption-core\.mjs/);
    expect(session).toMatch(/encryption-secret\.mjs/);
    expect(session).not.toMatch(/encryption-core\.mjs/);
  });

  it("migrate-json-to-relational.mjs imports shared decrypt (no local crypto decrypt)", () => {
    const body = readFileSync(
      resolve(process.cwd(), "scripts/migrate-json-to-relational.mjs"),
      "utf8",
    );
    expect(body).toMatch(/from ["']\.\.\/shared\/encryption-core\.mjs["']/);
    expect(body).not.toMatch(/function decrypt\s*\(/);
    expect(body).not.toMatch(/createDecipheriv/);
  });
});
