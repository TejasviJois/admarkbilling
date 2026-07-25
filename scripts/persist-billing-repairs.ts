/**
 * Persist one-shot Kapila + Rent Management billing repairs into operations_data.
 * Safe to re-run — no-ops once repair flags are set.
 *
 * Usage: npx tsx scripts/persist-billing-repairs.ts
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { applyProductionBillingRepairs } from "../src/lib/ground-zero.ts";
import { sumActiveMrr, sumPipelineBookedRevenue } from "../src/lib/project-billing.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(resolve(root, ".env"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

const sb = createClient(url, key);
const { data, error } = await sb
  .from("operations_data")
  .select("payload, updated_at")
  .eq("id", "default")
  .maybeSingle();
if (error) throw error;
if (!data?.payload || !data.updated_at) throw new Error("operations_data/default missing");

const raw = data.payload;
if (raw.kapilaRetainerRepairApplied && raw.rentManagementContractRepairApplied) {
  const pipeline = sumPipelineBookedRevenue(raw.projects ?? [], "2026-07-25");
  const mrr = sumActiveMrr(raw.projects ?? [], "2026-07-25");
  console.log("Repairs already applied — nothing to write.");
  console.log(`Revenue Booked ₹${pipeline.toLocaleString("en-IN")} · Active MRR ₹${mrr.toLocaleString("en-IN")}`);
  process.exit(0);
}

const repaired = applyProductionBillingRepairs(raw);
const asOf = new Date().toISOString().slice(0, 10);
const pipeline = sumPipelineBookedRevenue(repaired.projects ?? [], asOf);
const mrr = sumActiveMrr(repaired.projects ?? [], asOf);

const { data: updated, error: writeError } = await sb
  .from("operations_data")
  .update({ payload: repaired, updated_at: new Date().toISOString() })
  .eq("id", "default")
  .eq("updated_at", data.updated_at)
  .select("updated_at")
  .maybeSingle();

if (writeError) throw writeError;
if (!updated) {
  console.error("CAS conflict — row changed while repairing. Re-run the script.");
  process.exit(1);
}

console.log("Persisted Kapila + Rent Management billing repairs.");
console.log(`Revenue Booked ₹${pipeline.toLocaleString("en-IN")} · Active MRR ₹${mrr.toLocaleString("en-IN")}`);
console.log(`version ${updated.updated_at}`);
