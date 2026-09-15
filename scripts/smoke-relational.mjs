/**
 * Smoke-test relational read/write adapters against live Supabase.
 * Usage: node scripts/smoke-relational.mjs
 */
import { requireEgressAck } from './lib/egress-guard.mjs';
requireEgressAck(import.meta.url);
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(resolve(root, ".env"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase credentials missing");

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws },
});
const db = sb.schema("admark");

const failures = [];
function ok(name, cond, detail = "") {
  if (cond) console.log(`PASS ${name}`);
  else {
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
    failures.push(name);
  }
}

const { data: org, error: orgErr } = await db
  .from("organizations")
  .select("id, slug, name")
  .is("deleted_at", null)
  .limit(1)
  .maybeSingle();
ok("organizations readable", !orgErr && !!org?.id, orgErr?.message);

const orgId = org?.id;
async function count(table) {
  const { count, error } = await db
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .is("deleted_at", null);
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

if (orgId) {
  const tables = [
    "clients",
    "projects",
    "leads",
    "transactions",
    "payments",
    "calendar",
    "notifications",
    "activity_logs",
    "invoices",
    "team_members",
    "documents",
  ];
  for (const table of tables) {
    try {
      const n = await count(table);
      ok(`${table} readable`, n >= 0, `count=${n}`);
      console.log(`  ${table}: ${n}`);
    } catch (e) {
      ok(`${table} readable`, false, e.message);
    }
  }
}

// Version tokens must exist for relational CAS
for (const id of ["default", "documents", "activity_logs"]) {
  const { data, error } = await sb
    .from("operations_data")
    .select("updated_at")
    .eq("id", id)
    .maybeSingle();
  ok(`version token ${id}`, !error && !!data?.updated_at, error?.message);
}

// Env flags
ok("RELATIONAL_READS_ENABLED", process.env.RELATIONAL_READS_ENABLED?.toLowerCase() === "true");
ok(
  "RELATIONAL_DUAL_WRITES_ENABLED",
  process.env.RELATIONAL_DUAL_WRITES_ENABLED?.toLowerCase() === "true",
);

// Probe a tiny write: bump version token with CAS then verify
const { data: before } = await sb
  .from("operations_data")
  .select("updated_at")
  .eq("id", "default")
  .maybeSingle();
const next = new Date().toISOString();
const { data: bumped, error: bumpErr } = await sb
  .from("operations_data")
  .update({ updated_at: next })
  .eq("id", "default")
  .eq("updated_at", before.updated_at)
  .select("updated_at")
  .maybeSingle();
ok("CAS version bump", !bumpErr && !!bumped?.updated_at, bumpErr?.message);

if (failures.length) {
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\nAll smoke checks passed.");
