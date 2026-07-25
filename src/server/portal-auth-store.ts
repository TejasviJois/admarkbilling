import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { decrypt, encrypt } from "../../shared/encryption-core.mjs";

/** Project-root `.data/portal-auth.json` — server-only; never import from client code. */
const AUTH_DIR = resolve(process.cwd(), ".data");
const AUTH_FILE = resolve(AUTH_DIR, "portal-auth.json");

export type PortalAuthOverride = {
  /** AES-encrypted portal password (preferred). */
  passwordEnc?: string;
  /** Legacy plaintext — migrated on next write. */
  password?: string;
};

function decryptPassword(enc: string | undefined): string | undefined {
  if (!enc?.trim()) return undefined;
  try {
    const plain = decrypt(enc.trim());
    return plain?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export function readPortalAuthOverride(): PortalAuthOverride {
  try {
    if (!existsSync(AUTH_FILE)) return {};
    const raw = readFileSync(AUTH_FILE, "utf8");
    const parsed = JSON.parse(raw) as PortalAuthOverride;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Resolve plaintext password from local override file (supports legacy plaintext). */
export function readPortalPasswordPlain(): string | undefined {
  const raw = readPortalAuthOverride();
  const fromEnc = decryptPassword(raw.passwordEnc);
  if (fromEnc) return fromEnc;
  const legacy = raw.password?.trim();
  return legacy || undefined;
}

export function writePortalAuthOverride(override: { password: string }): void {
  if (!existsSync(AUTH_DIR)) {
    mkdirSync(AUTH_DIR, { recursive: true });
  }
  const password = override.password.trim();
  const next: PortalAuthOverride = {
    passwordEnc: encrypt(password),
  };
  writeFileSync(AUTH_FILE, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

/** Best-effort durable copy in Supabase settings (survives serverless redeploys). */
export async function readPortalPasswordFromCloud(): Promise<string | undefined> {
  try {
    const { getSupabaseServerConfig } = await import("./env");
    if (!getSupabaseServerConfig()) return undefined;
    const { requireServerSupabase } = await import("./supabase-admin");
    const sb = requireServerSupabase();
    const { data, error } = await sb
      .schema("admark")
      .from("settings")
      .select("feature_toggles")
      .limit(1)
      .maybeSingle();
    if (error || !data) return undefined;
    const toggles =
      data.feature_toggles && typeof data.feature_toggles === "object"
        ? (data.feature_toggles as Record<string, unknown>)
        : {};
    return decryptPassword(
      typeof toggles.portalPasswordEnc === "string" ? toggles.portalPasswordEnc : undefined,
    );
  } catch {
    return undefined;
  }
}

export async function writePortalPasswordToCloud(password: string): Promise<void> {
  try {
    const { getSupabaseServerConfig } = await import("./env");
    if (!getSupabaseServerConfig()) return;
    const { requireServerSupabase } = await import("./supabase-admin");
    const sb = requireServerSupabase();
    const { data: row } = await sb
      .schema("admark")
      .from("settings")
      .select("id, feature_toggles")
      .limit(1)
      .maybeSingle();
    if (!row?.id) return;
    const existing =
      row.feature_toggles && typeof row.feature_toggles === "object"
        ? (row.feature_toggles as Record<string, unknown>)
        : {};
    await sb
      .schema("admark")
      .from("settings")
      .update({
        feature_toggles: {
          ...existing,
          portalPasswordEnc: encrypt(password.trim()),
        },
      })
      .eq("id", row.id);
  } catch {
    // Local file remains the source of truth when cloud write is unavailable.
  }
}
