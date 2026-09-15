/**
 * Mirror invoice Log-payment rows onto projects as recordedAfterMigration payments.
 *
 * Usage: node scripts/backfill-invoice-project-payments.mjs
 */
import { requireEgressAck } from './lib/egress-guard.mjs';
requireEgressAck(import.meta.url);
import { createHash } from "node:crypto";
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
if (!url || !key) throw new Error("Missing Supabase credentials");

const sb = createClient(url, key, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});
const db = sb.schema("admark");

function stableUuid(scope, legacyId) {
  const bytes = createHash("sha256").update(`${scope}:${legacyId}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const isUuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value ?? "");
const normalize = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const { data: org, error: orgError } = await db
  .from("organizations")
  .select("id")
  .is("deleted_at", null)
  .limit(1)
  .maybeSingle();
if (orgError) throw orgError;
if (!org) throw new Error("No organization");

const [{ data: paymentRows }, { data: mapRows }, { data: invoiceRows }, { data: projectRows }, { data: clientRows }] =
  await Promise.all([
    db
      .from("payments")
      .select(
        "id, legacy_id, client_id, invoice_id, project_id, amount, payment_date, payment_method, notes, deleted_at",
      )
      .eq("organization_id", org.id)
      .is("deleted_at", null),
    db
      .from("legacy_record_map")
      .select("legacy_id, source_collection, target_id")
      .eq("organization_id", org.id)
      .eq("target_table", "payments"),
    db
      .from("invoices")
      .select("id, legacy_id, client_id, project_id, client_name_snapshot")
      .eq("organization_id", org.id)
      .is("deleted_at", null),
    db
      .from("projects")
      .select("id, legacy_id, client_id, display_name, historical_outstanding")
      .eq("organization_id", org.id)
      .is("deleted_at", null),
    db
      .from("clients")
      .select("id, legacy_id, company_name")
      .eq("organization_id", org.id)
      .is("deleted_at", null),
  ]);

const sourceByLegacy = new Map((mapRows ?? []).map((row) => [row.legacy_id, row.source_collection]));
const invoiceById = new Map((invoiceRows ?? []).map((row) => [row.id, row]));
const projectById = new Map((projectRows ?? []).map((row) => [row.id, row]));
const projectsByClient = new Map();
for (const project of projectRows ?? []) {
  if (!project.client_id) continue;
  const list = projectsByClient.get(project.client_id) ?? [];
  list.push(project);
  projectsByClient.set(project.client_id, list);
}
const paymentByLegacy = new Map((paymentRows ?? []).map((row) => [row.legacy_id, row]));

const topLevelInvoicePayments = (paymentRows ?? []).filter((row) => {
  if (!row.invoice_id) return false;
  if (String(row.legacy_id ?? "").startsWith("invoice-advance-")) return false;
  if (String(row.legacy_id ?? "").startsWith("invoice-recv-")) return false;
  const source = sourceByLegacy.get(row.legacy_id);
  return source !== "projectPayments";
});

console.log(`Top-level invoice payments: ${topLevelInvoicePayments.length}`);

const upsertPayments = [];
const upsertMaps = [];

for (const payment of topLevelInvoicePayments) {
  const invoice = invoiceById.get(payment.invoice_id);
  if (!invoice) {
    console.warn(`Skip ${payment.legacy_id}: invoice missing`);
    continue;
  }
  let projectId = payment.project_id || invoice.project_id || null;
  if (!projectId) {
    const candidates = projectsByClient.get(invoice.client_id) ?? [];
    if (candidates.length === 1) projectId = candidates[0].id;
    else if (candidates.length > 1) {
      // Prefer the project with the largest historical outstanding (BLX-style).
      projectId = [...candidates].sort(
        (a, b) => Number(b.historical_outstanding ?? 0) - Number(a.historical_outstanding ?? 0),
      )[0].id;
    }
  }
  if (!projectId) {
    console.warn(
      `Skip ${payment.legacy_id}: no project for invoice ${invoice.legacy_id} (${invoice.client_name_snapshot})`,
    );
    continue;
  }
  const project = projectById.get(projectId);
  const mirrorLegacy = `invoice-recv-${payment.legacy_id}`;
  const existing = paymentByLegacy.get(mirrorLegacy);
  const mirrorId =
    existing?.id ??
    (isUuid(mirrorLegacy) ? mirrorLegacy : stableUuid("payment", mirrorLegacy));
  upsertPayments.push({
    id: mirrorId,
    organization_id: org.id,
    legacy_id: mirrorLegacy,
    transaction_id: null,
    client_id: payment.client_id || invoice.client_id || project?.client_id,
    invoice_id: null,
    project_id: projectId,
    amount: payment.amount,
    payment_date: payment.payment_date,
    payment_method: payment.payment_method ?? "upi",
    reference_number: null,
    external_transaction_id: null,
    notes: payment.notes || `Invoice payment (${payment.payment_method || "other"})`,
    recurring: false,
    historical: false, // recordedAfterMigration
    deleted_at: null,
  });
  upsertMaps.push({
    id: stableUuid("legacy_map", `operations_data:projectPayments:${mirrorLegacy}:payments`),
    organization_id: org.id,
    source_table: "operations_data",
    source_collection: "projectPayments",
    legacy_id: mirrorLegacy,
    target_table: "payments",
    target_id: mirrorId,
  });
  console.log(
    `Mirror ${payment.legacy_id} ₹${payment.amount} → project ${project?.display_name ?? projectId} as ${mirrorLegacy}`,
  );
}

if (!upsertPayments.length) {
  console.log("Nothing to backfill.");
  process.exit(0);
}

const { error: payError } = await db.from("payments").upsert(upsertPayments, {
  onConflict: "organization_id,legacy_id",
});
if (payError) throw payError;

for (const row of upsertMaps) {
  const { data: existingMap } = await db
    .from("legacy_record_map")
    .select("id")
    .eq("organization_id", org.id)
    .eq("source_table", "operations_data")
    .eq("source_collection", "projectPayments")
    .eq("legacy_id", row.legacy_id)
    .eq("target_table", "payments")
    .maybeSingle();
  if (existingMap?.id) {
    const { error } = await db
      .from("legacy_record_map")
      .update({ target_id: row.target_id })
      .eq("id", existingMap.id);
    if (error) throw error;
  } else {
    const { error } = await db.from("legacy_record_map").insert(row);
    if (error) throw error;
  }
}

const blxProjects = (projectRows ?? []).filter((p) => /blx/i.test(p.display_name ?? ""));
for (const project of blxProjects) {
  const { data: mirrors } = await db
    .from("payments")
    .select("legacy_id, amount, historical")
    .eq("organization_id", org.id)
    .eq("project_id", project.id)
    .is("deleted_at", null)
    .like("legacy_id", "invoice-recv-%");
  const receivedAfter = (mirrors ?? [])
    .filter((row) => row.historical === false)
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const pending = Math.max(0, Number(project.historical_outstanding ?? 0) - receivedAfter);
  console.log(
    `BLX ${project.name}: histOutstanding=${project.historical_outstanding} receivedAfter=${receivedAfter} pending≈${pending}`,
  );
}

console.log(`Upserted ${upsertPayments.length} project payment mirror(s).`);
