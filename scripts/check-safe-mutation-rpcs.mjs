/**
 * Verifies that the safe-mutation RPCs from
 * supabase/migrations/20260719100000_safe_operations_mutations.sql exist.
 * Run: node scripts/check-safe-mutation-rpcs.mjs
 */
import { requireEgressAck } from './lib/egress-guard.mjs';
requireEgressAck(import.meta.url);
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// A deliberately stale timestamp: if the function exists it must answer with
// a conflict row instead of PGRST202 (missing function).
const STALE = "1970-01-01T00:00:00.000Z";

async function probe(name, args) {
  const { data, error } = await sb.rpc(name, args);
  if (error) {
    if (error.code === "PGRST202") return { name, exists: false };
    return { name, exists: true, note: `exists but errored: ${error.message}` };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return { name, exists: true, conflictHandled: row?.is_conflict === true };
}

const results = await Promise.all([
  probe("mutate_operations_data", {
    p_expected_updated_at: STALE,
    p_upserts: {},
    p_deletes: {},
    p_sets: {},
  }),
  probe("mutate_operations_aux_data", {
    p_row_id: "documents",
    p_expected_updated_at: STALE,
    p_entity_key: "agreements",
    p_upserts: [],
    p_deletes: [],
  }),
]);

console.log(JSON.stringify(results, null, 2));
const allExist = results.every((r) => r.exists);
console.log(allExist ? "PASS: safe-mutation RPCs are deployed" : "FAIL: migration not deployed");
process.exitCode = allExist ? 0 : 1;
