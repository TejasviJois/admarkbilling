/**
 * Type declarations paired with shared/encryption-secret.mjs (.d.mts ↔ .mjs).
 */
export declare const MIN_SECRET_LENGTH: 16;
export declare const DEV_FALLBACK_SECRET: string;

export type EncryptionEnv = {
  APP_SESSION_SECRET?: string;
  NODE_ENV?: string;
};

export declare function resolveEncryptionSecret(env?: EncryptionEnv): string;
