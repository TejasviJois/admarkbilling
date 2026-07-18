/* Read-only: counts records across the live Supabase tables. */
import { readFileSync } from "node:fs";
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

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Supabase credentials missing in .env");
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws },
});

const { data: opsRow, error: opsErr } = await sb
  .from("operations_data")
  .select("payload")
  .eq("id", "default")
  .maybeSingle();
if (opsErr) throw opsErr;
const ops = opsRow?.payload ?? {};

const len = (v) => (Array.isArray(v) ? v.length : 0);

const clients = ops.clients ?? [];
const rootClients = clients.filter((c) => !c.parentClientId);
const childClients = clients.filter((c) => c.parentClientId);
const projects = ops.projects ?? [];
const byStatus = {};
for (const p of projects) byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
const txns = ops.transactions ?? [];
const historicalTx = txns.filter((t) => t.historical).length;

const { count: invoiceCount, error: invErr } = await sb
  .from("invoices")
  .select("id", { count: "exact", head: true });
if (invErr) throw invErr;

const { data: companyRow } = await sb
  .from("company_settings")
  .select("payload")
  .eq("id", "default")
  .maybeSingle();
const company = companyRow?.payload ?? {};

console.log("=== operations_data (payload arrays) ===");
console.log("Clients (total):        ", clients.length, `(root: ${rootClients.length}, sub: ${childClients.length})`);
console.log("Projects (total):       ", projects.length, JSON.stringify(byStatus));
console.log("Leads:                  ", len(ops.leads));
console.log("Directory contacts:     ", len(ops.contacts));
console.log("Transactions:           ", txns.length, `(historical: ${historicalTx}, live: ${txns.length - historicalTx})`);
console.log("Fixed monthly costs:    ", len(ops.fixedMonthlyExpenses));
console.log("Founders:               ", len(ops.founders));
console.log("Partnerships:           ", len(ops.partnerships));
console.log("Assets:                 ", len(ops.assets));
console.log("Scheduled events:       ", len(ops.scheduledEvents ?? ops.events));
console.log("Agreements:             ", len(ops.agreements));
console.log("Activity log entries:   ", len(ops.activityLog));
console.log("Notifications:          ", len(ops.notifications));
console.log("\n=== invoices table ===");
console.log("Invoices:               ", invoiceCount ?? 0);
console.log("\n=== company_settings ===");
console.log("Team members:           ", len(company.companyMembers));
