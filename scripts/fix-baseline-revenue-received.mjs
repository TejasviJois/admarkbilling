/* One-time correction (2026-07-18): the Ground Zero baseline said
   totalRevenueReceived = 148,425 but the imported payments it summarizes
   add up to 147,425 (verified against the transaction log). Sets the stored
   baseline to the reconciled figure. A full backup is written first. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

for (const line of readFileSync(resolve(root, ".env"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const sb = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: ws } },
);

const { data, error } = await sb
  .from("operations_data")
  .select("payload")
  .eq("id", "default")
  .maybeSingle();
if (error) throw error;
if (!data?.payload) {
  console.log("No operations payload found — nothing to fix.");
  process.exit(0);
}

const payload = data.payload;
const baseline = payload.financialBaseline;
if (!baseline) {
  console.log("No stored baseline — nothing to fix.");
  process.exit(0);
}

// Safety: recompute the correct figure from the historical payment log.
const historicalReceived = (payload.transactions ?? [])
  .filter((t) => t.historical && (t.type === "client_payment" || t.type === "refund"))
  .reduce((s, t) => s + (t.type === "refund" ? -Math.abs(t.amount) : t.amount), 0);

console.log(`Stored baseline totalRevenueReceived: ${baseline.totalRevenueReceived}`);
console.log(`Historical payments actually logged:  ${historicalReceived}`);

if (baseline.totalRevenueReceived === historicalReceived) {
  console.log("Already consistent — nothing to do.");
  process.exit(0);
}

mkdirSync(resolve(root, "backups"), { recursive: true });
const backupPath = resolve(root, `backups/operations-before-baseline-fix-${Date.now()}.json`);
writeFileSync(backupPath, JSON.stringify(payload));
console.log(`Backup written: ${backupPath}`);

payload.financialBaseline = { ...baseline, totalRevenueReceived: historicalReceived };

const { error: updateError } = await sb
  .from("operations_data")
  .update({ payload })
  .eq("id", "default");
if (updateError) throw updateError;

console.log(`Baseline totalRevenueReceived corrected to ${historicalReceived}.`);
