import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { requireEgressAck } from './lib/egress-guard.mjs';
requireEgressAck("inspect-project-outstanding.mjs");

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

const { data: projects } = await db
  .from("projects")
  .select(
    "id, legacy_id, display_name, status, contract_value, historical_received, historical_outstanding, monthly_amount, client_id",
  )
  .eq("organization_id", org.id)
  .is("deleted_at", null);

const { data: clients } = await db
  .from("clients")
  .select("id, legacy_id, company_name")
  .eq("organization_id", org.id)
  .is("deleted_at", null);
const clientById = new Map((clients ?? []).map((c) => [c.id, c]));

const { data: maps } = await db
  .from("legacy_record_map")
  .select("legacy_id, source_collection")
  .eq("organization_id", org.id)
  .eq("target_table", "payments");
const sourceByLegacy = new Map((maps ?? []).map((m) => [m.legacy_id, m.source_collection]));

const { data: payments } = await db
  .from("payments")
  .select("legacy_id, amount, historical, project_id, invoice_id, payment_date, notes")
  .eq("organization_id", org.id)
  .is("deleted_at", null);

const paysByProject = new Map();
for (const p of payments ?? []) {
  if (!p.project_id) continue;
  const list = paysByProject.get(p.project_id) ?? [];
  list.push(p);
  paysByProject.set(p.project_id, list);
}

function pending(project) {
  const histOut = project.historical_outstanding;
  const pays = paysByProject.get(project.id) ?? [];
  let after = 0;
  for (const pay of pays) {
    const source = sourceByLegacy.get(pay.legacy_id);
    if (source === "projectPayments" && pay.historical === false) {
      after += Number(pay.amount) || 0;
    }
  }
  if (histOut === null) return { pending: null, after, note: "null histOut (retainer?)" };
  if (histOut !== undefined && histOut !== null) {
    return { pending: Math.max(0, Number(histOut) - after), after, note: "gz lock" };
  }
  const target = Number(project.contract_value) || 0;
  const histRec = Number(project.historical_received) || 0;
  return {
    pending: Math.max(0, target - histRec - after),
    after,
    note: "contract-hist",
  };
}

console.log("=== Active / completed-ish revenue projects ===");
for (const p of (projects ?? []).sort((a, b) =>
  (clientById.get(a.client_id)?.company_name || "").localeCompare(
    clientById.get(b.client_id)?.company_name || "",
  ),
)) {
  if (!["active", "completed", "on_hold", "planning"].includes(p.status)) continue;
  const client = clientById.get(p.client_id);
  const sum = pending(p);
  const pays = paysByProject.get(p.id) ?? [];
  console.log({
    client: client?.company_name,
    project: p.display_name,
    legacy: p.legacy_id,
    status: p.status,
    contract: p.contract_value,
    monthly: p.monthly_amount,
    histRec: p.historical_received,
    histOut: p.historical_outstanding,
    receivedAfter: sum.after,
    pending: sum.pending,
    payments: pays.map(
      (x) =>
        `${x.legacy_id}:${x.amount}:hist=${x.historical}:src=${sourceByLegacy.get(x.legacy_id)}`,
    ),
  });
}

// Dashboard-style sum for non-cancelled
let dash = 0;
for (const p of projects ?? []) {
  if (p.status === "cancelled") continue;
  const sum = pending(p);
  if (sum.pending != null) dash += sum.pending;
}
console.log("\nDashboard-ish outstanding sum:", dash);
