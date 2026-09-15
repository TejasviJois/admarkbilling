/**
 * Compare legacy operations_data JSON blob vs admark relational tables,
 * focusing on records dated after a cutoff (default 2026-08-21).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { decrypt } from "../shared/encryption-core.mjs";
import { requireEgressAck } from './lib/egress-guard.mjs';
requireEgressAck("compare-blob-vs-relational.mjs");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(resolve(root, ".env"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const CUTOFF = process.argv[2] || "2026-08-21";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});
const db = sb.schema("admark");

function decryptDeep(value) {
  if (typeof value === "string") {
    try {
      return decrypt(value) ?? value;
    } catch {
      return value;
    }
  }
  if (Array.isArray(value)) return value.map(decryptDeep);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = decryptDeep(v);
    return out;
  }
  return value;
}

function dateOf(item) {
  return (
    item?.date ||
    item?.eventDate ||
    item?.paymentDate ||
    item?.createdAt ||
    item?.updatedAt ||
    item?.clientSince ||
    null
  );
}

function afterCutoff(item) {
  const d = dateOf(item);
  if (d == null) return false;
  if (typeof d === "number") return new Date(d).toISOString().slice(0, 10) > CUTOFF;
  const s = String(d).slice(0, 10);
  return s > CUTOFF;
}

const { data: opsRow, error } = await sb
  .from("operations_data")
  .select("payload, updated_at")
  .eq("id", "default")
  .maybeSingle();
if (error) throw error;

const raw = opsRow?.payload ?? {};
const ops = decryptDeep(raw);

console.log("=== JSON blob (operations_data/default) ===");
console.log("Row updated_at:", opsRow?.updated_at);
console.log("Cutoff (exclusive):", CUTOFF);

const collections = [
  "projects",
  "clients",
  "contacts",
  "leads",
  "transactions",
  "payments",
  "scheduleEvents",
  "expenses",
  "notifications",
  "partnerships",
];

for (const key of collections) {
  const arr = Array.isArray(ops[key]) ? ops[key] : [];
  const recent = arr.filter(afterCutoff);
  console.log(`\n${key}: total=${arr.length}, after ${CUTOFF}=${recent.length}`);
  for (const item of recent.slice(0, 15)) {
    console.log(
      `  - ${item.id ?? "?"} | ${dateOf(item)} | ${item.name || item.title || item.description || item.companyName || item.company || item.personName || ""}`.slice(
        0,
        140,
      ),
    );
  }
  if (recent.length > 15) console.log(`  ... +${recent.length - 15} more`);
}

// Project payments nested
let nestedPay = 0;
let nestedPayRecent = 0;
for (const p of ops.projects ?? []) {
  for (const pay of p.payments ?? []) {
    nestedPay++;
    if (afterCutoff(pay)) {
      nestedPayRecent++;
      console.log(
        `  projectPayment ${pay.id} project=${p.id} date=${pay.date} amount=${pay.amount}`,
      );
    }
  }
}
console.log(`\nproject.payments nested: total=${nestedPay}, after ${CUTOFF}=${nestedPayRecent}`);

// Relational counts by date
const { data: org } = await db
  .from("organizations")
  .select("id")
  .is("deleted_at", null)
  .limit(1)
  .maybeSingle();

async function relationalAfter(table, dateCol) {
  const { data, error: e } = await db
    .from(table)
    .select(`id, legacy_id, ${dateCol}`)
    .eq("organization_id", org.id)
    .is("deleted_at", null)
    .gt(dateCol, CUTOFF)
    .limit(200);
  if (e) return { error: e.message, rows: [] };
  return { rows: data ?? [] };
}

console.log("\n=== Relational (admark.*) after cutoff ===");
for (const [table, col] of [
  ["transactions", "transaction_date"],
  ["payments", "payment_date"],
  ["calendar", "event_date"],
  ["projects", "updated_at"],
  ["leads", "updated_at"],
  ["activity_logs", "occurred_at"],
]) {
  const { rows, error: e } = await relationalAfter(table, col);
  console.log(`${table}: ${e ? `ERROR ${e}` : rows.length}`);
  for (const r of rows.slice(0, 8)) {
    console.log(`  - ${r.legacy_id ?? r.id} | ${r[col]}`);
  }
}

// Compare transaction IDs
const blobTx = new Set((ops.transactions ?? []).map((t) => t.id).filter(Boolean));
const { data: relTx } = await db
  .from("transactions")
  .select("legacy_id")
  .eq("organization_id", org.id)
  .is("deleted_at", null)
  .limit(5000);
const relTxIds = new Set((relTx ?? []).map((r) => r.legacy_id).filter(Boolean));
const onlyBlob = [...blobTx].filter((id) => !relTxIds.has(id));
const onlyRel = [...relTxIds].filter((id) => !blobTx.has(id));
console.log("\n=== Transaction ID diff ===");
console.log("blob only:", onlyBlob.length, onlyBlob.slice(0, 20));
console.log("relational only:", onlyRel.length, onlyRel.slice(0, 20));

const blobEvents = new Set((ops.scheduleEvents ?? []).map((e) => e.id).filter(Boolean));
const { data: relCal } = await db
  .from("calendar")
  .select("legacy_id")
  .eq("organization_id", org.id)
  .is("deleted_at", null)
  .limit(5000);
const relCalIds = new Set((relCal ?? []).map((r) => r.legacy_id).filter(Boolean));
console.log("\n=== Calendar ID diff ===");
console.log(
  "blob only:",
  [...blobEvents].filter((id) => !relCalIds.has(id)).length,
  [...blobEvents].filter((id) => !relCalIds.has(id)).slice(0, 20),
);
console.log(
  "relational only:",
  [...relCalIds].filter((id) => !blobEvents.has(id)).length,
);

const blobProjects = new Map((ops.projects ?? []).map((p) => [p.id, p]));
const { data: relProjects } = await db
  .from("projects")
  .select("legacy_id, updated_at, name, status")
  .eq("organization_id", org.id)
  .is("deleted_at", null)
  .limit(5000);
console.log("\n=== Projects after cutoff in blob (by startDate/updatedAt/any payment) ===");
for (const p of ops.projects ?? []) {
  const dates = [
    p.startDate,
    p.endDate,
    ...(p.payments ?? []).map((x) => x.date),
    p.updatedAt ? new Date(p.updatedAt).toISOString().slice(0, 10) : null,
  ].filter(Boolean);
  const recent = dates.some((d) => String(d).slice(0, 10) > CUTOFF);
  if (recent) {
    console.log(
      `  ${p.id} | ${p.name} | status=${p.status} | payments=${(p.payments ?? []).length} | dates=${dates.join(",")}`,
    );
  }
}

console.log("\nBlob project count:", blobProjects.size, "Rel project count:", (relProjects ?? []).length);
