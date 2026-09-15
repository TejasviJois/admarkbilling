/**
 * Persist one-shot ₹2,000 historical company-expense reconciliation.
 * Safe to re-run — no-ops once historicalExpenseReconciliationApplied is set.
 *
 * Usage: npx tsx scripts/persist-historical-expense-reconciliation.ts
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { applyProductionBillingRepairs } from "../src/lib/ground-zero.ts";
import { computeFinancialSummary } from "../src/lib/financial.ts";
import { requireEgressAck } from "./lib/egress-guard.ts";

requireEgressAck("persist-historical-expense-reconciliation.ts");

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
if (raw.historicalExpenseReconciliationApplied) {
  const financial = computeFinancialSummary(raw);
  console.log("Historical expense reconciliation already applied — nothing to write.");
  console.log(
    `Revenue ₹${financial.totalRevenueReceived.toLocaleString("en-IN")} · Expenses ₹${financial.totalExpense.toLocaleString("en-IN")} · Cash ₹${financial.currentCashBalance.toLocaleString("en-IN")}`,
  );
  process.exit(0);
}

const repaired = applyProductionBillingRepairs(raw);
const financial = computeFinancialSummary(repaired);

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

console.log("Persisted ₹2,000 historical company expense.");
console.log(
  `Revenue ₹${financial.totalRevenueReceived.toLocaleString("en-IN")} · Expenses ₹${financial.totalExpense.toLocaleString("en-IN")} · Cash ₹${financial.currentCashBalance.toLocaleString("en-IN")}`,
);
console.log(`version ${updated.updated_at}`);
