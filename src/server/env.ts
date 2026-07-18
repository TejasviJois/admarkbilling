/** Supabase credentials for server functions only (never expose service role to the client). */
export function getSupabaseServerConfig(): { url: string; serviceRoleKey: string } | null {
  const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
}

/** Relational reads stay opt-in until migration reconciliation has passed. */
export function relationalReadsEnabled(): boolean {
  return process.env.RELATIONAL_READS_ENABLED?.trim().toLowerCase() === "true";
}

/** Dual writes may be enabled separately during the migration observation window. */
export function relationalDualWritesEnabled(): boolean {
  return process.env.RELATIONAL_DUAL_WRITES_ENABLED?.trim().toLowerCase() === "true";
}
