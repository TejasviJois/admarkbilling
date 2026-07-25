/**
 * Restore the deleted Kapila retainer project (was under Safewheels Group).
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { buildRevenueValueFromBilling } from "../src/lib/project-billing.ts";
import { sumActiveMrr, sumPipelineBookedRevenue, computeBookedRevenue } from "../src/lib/project-billing.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(resolve(root, ".env"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const PROJECT_ID = "proj-lead-lead-be258f6a";
const CLIENT_ID = "cli-kapila-management-software";

const billing = {
  monthlyAmount: 10_000,
  monthlyStartDate: "2026-07-08",
};

const restoredProject = {
  id: PROJECT_ID,
  name: "Kapila ERP",
  client: "Kapila Management Software",
  clientId: CLIENT_ID,
  status: "completed",
  projectType: "ERP",
  billing,
  revenueValue: buildRevenueValueFromBilling(billing),
  historicalReceived: 10_000,
  historicalOutstanding: null,
  payments: [],
  startDate: "2026-07-25",
  notes: "Created from lead pipeline (Meeting Scheduled). Restored after accidental delete.",
  organizationId: "org-admark-digitals",
  leadId: "lead-be258f6a",
};

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { data, error } = await sb
  .from("operations_data")
  .select("payload, updated_at")
  .eq("id", "default")
  .maybeSingle();
if (error) throw error;
if (!data?.payload || !data.updated_at) throw new Error("missing operations_data");

const ops = structuredClone(data.payload);
const existing = (ops.projects ?? []).find((p: { id: string }) => p.id === PROJECT_ID);
if (existing) {
  console.log("Project already present — nothing to restore.");
  console.log(JSON.stringify({ id: existing.id, client: existing.client, name: existing.name, billing: existing.billing }, null, 2));
  process.exit(0);
}

// Ensure Kapila Management Software client exists under Safewheels Group.
ops.clients = ops.clients ?? [];
if (!ops.clients.some((c: { id: string }) => c.id === CLIENT_ID)) {
  ops.clients.push({
    id: CLIENT_ID,
    companyName: "Kapila Management Software",
    contactPerson: "Kapila Management Software",
    phone: "",
    email: "",
    billingAddress: "",
    status: "active",
    clientSince: "2026-07-18",
    organizationId: "org-admark-digitals",
    parentClientId: "cli-relationship-prajwal",
    notes: "Restored with Kapila retainer project.",
  });
}

ops.projects = [restoredProject, ...(ops.projects ?? [])];

// Restore Ground Zero-style historical ledger row if missing.
ops.transactions = ops.transactions ?? [];
const txId = `tx-gz-project-payment-${PROJECT_ID}`;
if (!ops.transactions.some((t: { id: string }) => t.id === txId)) {
  ops.transactions.push({
    id: txId,
    type: "client_payment",
    date: "2026-07-17",
    amount: 10_000,
    description: "Kapila Management Software: historical payment received",
    category: "Imported balance · Outstanding not defined",
    paymentMethod: "upi",
    relatedClientId: CLIENT_ID,
    relatedProjectId: PROJECT_ID,
    notes:
      "Imported payment total as of Ground Zero. Display-only ledger context; already included in the opening financial baseline.",
    historical: true,
    createdAt: Date.parse("2026-07-17T00:00:00+05:30"),
    updatedAt: Date.parse("2026-07-17T00:00:00+05:30"),
  });
}

ops.kapilaRetainerRepairApplied = true;

const asOf = "2026-07-25";
const pipeline = sumPipelineBookedRevenue(ops.projects, asOf);
const mrr = sumActiveMrr(ops.projects, asOf);
const booked = computeBookedRevenue(restoredProject as never, asOf);

const { data: updated, error: writeError } = await sb
  .from("operations_data")
  .update({ payload: ops, updated_at: new Date().toISOString() })
  .eq("id", "default")
  .eq("updated_at", data.updated_at)
  .select("updated_at")
  .maybeSingle();

if (writeError) throw writeError;
if (!updated) {
  console.error("CAS conflict — someone else saved. Re-run this script.");
  process.exit(1);
}

console.log("Restored Kapila retainer project.");
console.log(`  ${restoredProject.client} — ${restoredProject.name}`);
console.log(`  ₹${restoredProject.billing.monthlyAmount}/month ongoing · booked ₹${booked}`);
console.log(`Revenue Booked ₹${pipeline.toLocaleString("en-IN")} · Active MRR ₹${mrr.toLocaleString("en-IN")}`);
console.log(`version ${updated.updated_at}`);
