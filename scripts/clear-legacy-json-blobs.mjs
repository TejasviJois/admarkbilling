/**
 * Clear legacy JSON blobs after relational cutover.
 *
 * Keeps operations_data / company_settings ROW shells (needed for CAS version
 * tokens + health checks) but replaces payloads with empty stubs.
 * Deletes public.invoices rows once they exist in admark.invoices.
 *
 * Usage:
 *   node scripts/clear-legacy-json-blobs.mjs           # dry-run
 *   node scripts/clear-legacy-json-blobs.mjs --apply   # write
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { requireEgressAck } from './lib/egress-guard.mjs';
requireEgressAck("clear-legacy-json-blobs.mjs");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apply = process.argv.includes("--apply");

for (const line of readFileSync(resolve(root, ".env"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

if (process.env.RELATIONAL_READS_ENABLED?.trim().toLowerCase() !== "true") {
  throw new Error(
    "REFUSED: RELATIONAL_READS_ENABLED must be true before clearing JSON blobs.",
  );
}

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});
const db = sb.schema("admark");

const EMPTY_OPS = {
  projects: [],
  partnerships: [],
  expenses: [],
  clients: [],
  contacts: [],
  leads: [],
  payments: [],
  transactions: [],
  notifications: [],
  scheduleEvents: [],
  founders: [],
  assets: [],
  fixedMonthlyExpenses: [],
  clearedLegacyJsonBlob: true,
  clearedAt: new Date().toISOString(),
};
const EMPTY_DOCS = {
  agreements: [],
  archiveDocuments: [],
  clearedLegacyJsonBlob: true,
  clearedAt: new Date().toISOString(),
};
const EMPTY_ACTIVITY = {
  entries: [],
  clearedLegacyJsonBlob: true,
  clearedAt: new Date().toISOString(),
};
const EMPTY_COMPANY = {
  clearedLegacyJsonBlob: true,
  clearedAt: new Date().toISOString(),
};

async function payloadBytes(table, id) {
  const { data, error } = await sb.from(table).select("payload").eq("id", id).maybeSingle();
  if (error) throw error;
  return JSON.stringify(data?.payload ?? null).length;
}

const { count: publicInvoiceCount, error: invCountError } = await sb
  .from("invoices")
  .select("id", { count: "exact", head: true });
if (invCountError) throw invCountError;

const { count: relationalInvoiceCount, error: relInvError } = await db
  .from("invoices")
  .select("id", { count: "exact", head: true })
  .is("deleted_at", null);
if (relInvError) throw relInvError;

console.log(`Mode: ${apply ? "APPLY" : "dry-run"}`);
console.log(`RELATIONAL_READS_ENABLED=${process.env.RELATIONAL_READS_ENABLED}`);
console.log(`public.invoices=${publicInvoiceCount} admark.invoices=${relationalInvoiceCount}`);

const opsRows = [
  { id: "default", empty: EMPTY_OPS },
  { id: "documents", empty: EMPTY_DOCS },
  { id: "activity_logs", empty: EMPTY_ACTIVITY },
];

let freed = 0;
for (const row of opsRows) {
  const before = await payloadBytes("operations_data", row.id);
  freed += before;
  console.log(`operations_data/${row.id}: ${before} bytes → stub`);
  if (apply) {
    // Preserve updated_at so in-flight CAS tokens stay valid.
    const { error } = await sb
      .from("operations_data")
      .update({ payload: row.empty })
      .eq("id", row.id);
    if (error) throw error;
  }
}

const companyBefore = await payloadBytes("company_settings", "default");
freed += companyBefore;
console.log(`company_settings/default: ${companyBefore} bytes → stub`);
if (apply) {
  const { error } = await sb
    .from("company_settings")
    .update({ payload: EMPTY_COMPANY })
    .eq("id", "default");
  if (error) throw error;
}

if ((publicInvoiceCount ?? 0) > 0) {
  if ((relationalInvoiceCount ?? 0) < (publicInvoiceCount ?? 0)) {
    console.warn(
      `Skipping public.invoices delete — relational has fewer rows (${relationalInvoiceCount} < ${publicInvoiceCount}).`,
    );
  } else {
    console.log(`public.invoices: delete ${publicInvoiceCount} row(s)`);
    if (apply) {
      const { error } = await sb.from("invoices").delete().neq("id", "");
      if (error) throw error;
    }
  }
}

console.log(
  `${apply ? "Cleared" : "Would clear"} ~${(freed / 1024 / 1024).toFixed(2)} MB of JSON payload.`,
);
console.log(
  "Note: operations_data / company_settings rows are KEPT (version tokens). Do not turn off RELATIONAL_READS_ENABLED.",
);
if (!apply) console.log("Re-run with --apply to write.");
