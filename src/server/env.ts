/** Supabase credentials for server functions only (never expose service role to the client). */
export function getSupabaseServerConfig(): { url: string; serviceRoleKey: string } | null {
  const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
}

function envFlag(name: string, defaultOn: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return defaultOn;
  if (raw === "false" || raw === "0" || raw === "off" || raw === "no") return false;
  if (raw === "true" || raw === "1" || raw === "on" || raw === "yes") return true;
  return defaultOn;
}

/**
 * Relational `admark.*` is the only supported data path.
 * Defaults ON — unset or any value other than an explicit off means relational.
 * Legacy JSON blob reads burned multi-GB egress and are retired.
 */
export function relationalReadsEnabled(): boolean {
  return envFlag("RELATIONAL_READS_ENABLED", true);
}

/** @deprecated Unused — relational writes always target admark.*; kept for env compatibility. */
export function relationalDualWritesEnabled(): boolean {
  return envFlag("RELATIONAL_DUAL_WRITES_ENABLED", true);
}

const LEGACY_JSON_DISABLED_MESSAGE =
  "Legacy JSON blob storage is retired (egress protection). " +
  "Keep RELATIONAL_READS_ENABLED=true (or unset — default is on) and use admark.* tables only.";

/** Call before any code that would read/write operations_data.payload or public invoice JSON. */
export function assertRelationalMode(): void {
  if (!relationalReadsEnabled()) {
    throw new Error(LEGACY_JSON_DISABLED_MESSAGE);
  }
}
