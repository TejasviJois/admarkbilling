/**
 * Verify Revenue Booked / MRR / retainer maths against live operations_data.
 * Usage: npx tsx scripts/verify-accounts.ts
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { applyProductionBillingRepairs } from "../src/lib/ground-zero.ts";
import {
  computeBookedRevenue,
  sumActiveMrr,
  sumFutureMonthlyPipeline,
  sumPipelineBookedRevenue,
  projectHasOpenRetainer,
  resolveProjectBilling,
  recurringStatus,
} from "../src/lib/project-billing.ts";
import { computeFinancialSummary } from "../src/lib/financial.ts";
import { paymentSummary, totalReceived } from "../src/lib/project-payments.ts";
import { requireEgressAck } from "./lib/egress-guard.ts";

requireEgressAck("verify-accounts.ts");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(resolve(root, ".env"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { data, error } = await sb
  .from("operations_data")
  .select("payload, updated_at")
  .eq("id", "default")
  .maybeSingle();
if (error) throw error;
if (!data?.payload?.projects) throw new Error("no operations payload");

const ops = applyProductionBillingRepairs(data.payload);
const asOf = new Date().toISOString().slice(0, 10);
const financial = computeFinancialSummary(ops);
const pipeline = sumPipelineBookedRevenue(ops.projects, asOf);
const mrr = sumActiveMrr(ops.projects, asOf);
const future = sumFutureMonthlyPipeline(ops.projects, asOf);

const rows = ops.projects.map((p) => {
  const billing = resolveProjectBilling(p);
  const { target, pending } = paymentSummary(p);
  return {
    name: p.name,
    client: p.client,
    status: p.status,
    booked: computeBookedRevenue(p, asOf),
    received: totalReceived(p),
    target,
    pending,
    hasOpenRetainer: projectHasOpenRetainer(p, asOf),
    recurring: recurringStatus(billing, asOf),
    monthly: billing.monthlyAmount ?? null,
  };
});

const checks = [
  ["Financial booked matches pipeline", financial.totalRevenueBooked === pipeline],
  ["Active MRR is ₹10,000", mrr === 10_000],
  [
    "Kapila booked with ₹10k received",
    rows.some(
      (r) =>
        /kapila/i.test(`${r.client} ${r.name}`) &&
        r.monthly === 10_000 &&
        r.booked === 10_000 &&
        r.received >= 10_000,
    ),
  ],
  [
    "Rent Management booked ₹80,000",
    rows.some((r) => /rent management/i.test(`${r.name}`) && r.booked === 80_000),
  ],
  ["Pipeline booked is positive", pipeline > 0],
  ["All booked amounts finite", rows.every((r) => Number.isFinite(r.booked) && r.booked >= 0)],
] as const;

let failed = 0;
console.log("=== ACCOUNTS VERIFY ===");
console.log(`updated_at ${data.updated_at}`);
console.log(`Revenue Booked ₹${pipeline.toLocaleString("en-IN")}`);
console.log(`Active MRR     ₹${mrr.toLocaleString("en-IN")}/mo`);
console.log(`Future monthly ₹${future.toLocaleString("en-IN")}/mo`);
console.log(`Received       ₹${financial.totalRevenueReceived.toLocaleString("en-IN")}`);
console.log(`Cash           ₹${financial.currentCashBalance.toLocaleString("en-IN")}`);
console.log("");
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed += 1;
}
console.log("");
console.log(
  failed === 0
    ? "ALL CHECKS PASSED"
    : `${failed} CHECK(S) FAILED`,
);
process.exit(failed === 0 ? 0 : 1);
