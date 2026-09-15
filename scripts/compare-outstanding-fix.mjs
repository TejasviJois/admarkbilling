import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { requireEgressAck } from './lib/egress-guard.mjs';
requireEgressAck("compare-outstanding-fix.mjs");

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
const { data: org } = await db.from("organizations").select("id").is("deleted_at", null).limit(1).maybeSingle();

const { data: projects } = await db
  .from("projects")
  .select(
    "id, legacy_id, display_name, status, contract_value, upfront_amount, historical_received, historical_outstanding, monthly_amount, client_id",
  )
  .eq("organization_id", org.id)
  .is("deleted_at", null);

const { data: maps } = await db
  .from("legacy_record_map")
  .select("legacy_id, source_collection")
  .eq("organization_id", org.id)
  .eq("target_table", "payments");
const sourceByLegacy = new Map((maps ?? []).map((m) => [m.legacy_id, m.source_collection]));

const { data: payments } = await db
  .from("payments")
  .select("legacy_id, amount, historical, project_id")
  .eq("organization_id", org.id)
  .is("deleted_at", null);

function receivedAfter(projectId) {
  return (payments ?? [])
    .filter(
      (p) =>
        p.project_id === projectId &&
        sourceByLegacy.get(p.legacy_id) === "projectPayments" &&
        p.historical === false,
    )
    .reduce((s, p) => s + Number(p.amount), 0);
}

function estimate(p) {
  const after = receivedAfter(p.id);
  const hist = Number(p.historical_received) || 0;
  const received = hist + after;
  // Simulate current buggy paymentSummary pending
  let pending;
  if (p.historical_outstanding !== undefined) {
    // always true from DB
    pending =
      p.historical_outstanding == null
        ? null
        : Math.max(0, Number(p.historical_outstanding) - after);
  }
  const target =
    p.historical_outstanding != null
      ? hist + Number(p.historical_outstanding)
      : p.contract_value != null
        ? Number(p.contract_value)
        : p.upfront_amount != null
          ? Number(p.upfront_amount)
          : null;

  // estimatedPending
  let est = pending;
  if (est == null && target != null) est = Math.max(0, target - received);
  if (est == null) est = 0;

  // FIXED: treat null histOut as undefined unless monthly retainer
  const isRetainer = p.monthly_amount != null && Number(p.monthly_amount) > 0;
  let pendingFixed;
  if (p.historical_outstanding != null) {
    pendingFixed = Math.max(0, Number(p.historical_outstanding) - after);
  } else if (isRetainer) {
    pendingFixed = null;
  } else if (target != null) {
    pendingFixed = Math.max(0, (Number(p.contract_value) || Number(p.upfront_amount) || 0) - received);
  } else {
    pendingFixed = null;
  }
  const estFixed =
    pendingFixed != null
      ? pendingFixed
      : target != null && !isRetainer
        ? Math.max(0, target - received)
        : 0;

  return { pending, est, pendingFixed, estFixed, target, received, after, isRetainer };
}

const revenue = new Set(["active", "completed", "on_hold"]);
let dash = 0;
let dashFixed = 0;
console.log("Project | status | buggyEst | fixedEst | notes");
for (const p of projects ?? []) {
  if (!revenue.has(p.status)) continue;
  const e = estimate(p);
  dash += e.est;
  dashFixed += e.estFixed;
  if (e.est !== e.estFixed || e.est > 0 || e.after > 0 || (e.target && e.target >= 10000)) {
    console.log(
      `${p.display_name} | ${p.status} | histOut=${p.historical_outstanding} monthly=${p.monthly_amount} contract=${p.contract_value} | buggy=${e.est} fixed=${e.estFixed} recv=${e.received} target=${e.target}`,
    );
  }
}
console.log("\nDashboard buggy sum:", dash);
console.log("Dashboard fixed sum:", dashFixed);
