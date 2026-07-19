/**
 * Type declarations paired with shared/encryption-core.mjs (.d.mts ↔ .mjs).
 */
export declare const ALGORITHM: "aes-256-cbc";
export declare const MIN_SECRET_LENGTH: 16;
export declare const DEV_FALLBACK_SECRET: string;

export type EncryptionEnv = {
  APP_SESSION_SECRET?: string;
  NODE_ENV?: string;
};

export declare function resolveEncryptionSecret(env?: EncryptionEnv): string;
export declare function deriveEncryptionKey(env?: EncryptionEnv): Buffer;
export declare function encrypt(text: string, env?: EncryptionEnv): string;
export declare function decrypt(encryptedText: string, env?: EncryptionEnv): string;
