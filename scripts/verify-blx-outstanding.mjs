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

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});
const db = sb.schema("admark");
const { data: org } = await db
  .from("organizations")
  .select("id")
  .is("deleted_at", null)
  .limit(1)
  .maybeSingle();

const projectId = "cd0e26a1-e799-50b1-9662-9bdf5e36ccc8";
const { data: project } = await db
  .from("projects")
  .select("display_name, historical_outstanding, historical_received, legacy_id")
  .eq("id", projectId)
  .maybeSingle();

const { data: pays } = await db
  .from("payments")
  .select("id, legacy_id, amount, historical, project_id, invoice_id")
  .eq("organization_id", org.id)
  .eq("project_id", projectId)
  .is("deleted_at", null);

const { data: maps } = await db
  .from("legacy_record_map")
  .select("legacy_id, source_collection")
  .eq("organization_id", org.id)
  .eq("target_table", "payments")
  .in(
    "legacy_id",
    (pays ?? []).map((p) => p.legacy_id),
  );

const sourceByLegacy = new Map((maps ?? []).map((m) => [m.legacy_id, m.source_collection]));
let receivedAfter = 0;
for (const p of pays ?? []) {
  const source = sourceByLegacy.get(p.legacy_id) ?? "(none)";
  const counts =
    source === "projectPayments" && p.historical === false ? Number(p.amount) : 0;
  receivedAfter += counts;
  console.log({
    legacy: p.legacy_id,
    amount: p.amount,
    historical: p.historical,
    source,
    countsTowardOutstanding: counts,
  });
}
console.log({
  project: project?.display_name,
  histOut: project?.historical_outstanding,
  histRec: project?.historical_received,
  receivedAfterMigration: receivedAfter,
  pending: Math.max(0, Number(project?.historical_outstanding || 0) - receivedAfter),
});
