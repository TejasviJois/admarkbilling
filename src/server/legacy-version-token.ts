import { requireServerSupabase } from "./supabase-admin";

export type VersionBumpResult =
  | { ok: true; version: string }
  | { ok: false; conflict: true; version: string };

/** Optimistic-concurrency token stored on legacy `operations_data` rows. */
export async function readLegacyVersionToken(rowId: string): Promise<string> {
  const sb = requireServerSupabase();
  const { data, error } = await sb
    .from("operations_data")
    .select("updated_at")
    .eq("id", rowId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.updated_at) {
    throw new Error(`operations_data/${rowId} is missing a version token.`);
  }
  return data.updated_at;
}

/** Bumps only `updated_at` — payload JSON is untouched (relational-primary mode). */
export async function bumpLegacyVersionToken(
  rowId: string,
  expectedVersion: string,
): Promise<VersionBumpResult> {
  const sb = requireServerSupabase();
  const nextVersion = new Date().toISOString();
  const { data, error } = await sb
    .from("operations_data")
    .update({ updated_at: nextVersion })
    .eq("id", rowId)
    .eq("updated_at", expectedVersion)
    .select("updated_at")
    .maybeSingle();
  if (error) throw error;
  if (!data?.updated_at) {
    const current = await readLegacyVersionToken(rowId);
    return { ok: false, conflict: true, version: current };
  }
  return { ok: true, version: data.updated_at };
}
