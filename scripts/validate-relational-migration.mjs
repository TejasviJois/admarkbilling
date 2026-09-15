/**
 * Read-only reconciliation between legacy JSON and the admark relational schema.
 * Exits non-zero when counts, relationships, or core financial totals diverge.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { requireEgressAck } from './lib/egress-guard.mjs';
requireEgressAck("validate-relational-migration.mjs");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(resolve(root, ".env"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase credentials missing in .env");

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws },
});
const relational = sb.schema("admark");
const array = (value) => (Array.isArray(value) ? value : []);
const round = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

async function legacyRow(id) {
  const { data, error } = await sb
    .from("operations_data")
    .select("payload")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data?.payload ?? {};
}

async function targetRows(table, columns = "*") {
  const { data, error } = await relational
    .from(table)
    .select(columns)
    .is("deleted_at", null)
    .limit(10000);
  if (error) {
    throw new Error(
      `${table}: ${error.message}. Ensure the schema migration ran and \`admark\` is exposed through Supabase API settings.`,
    );
  }
  return data ?? [];
}

const ops = await legacyRow("default");
const docs = await legacyRow("documents");
const logs = await legacyRow("activity_logs");
const { data: companyRow, error: companyError } = await sb
  .from("company_settings")
  .select("payload")
  .eq("id", "default")
  .maybeSingle();
if (companyError) throw companyError;
const company = companyRow?.payload ?? {};
const { data: invoiceRows, error: invoiceError } = await sb.from("invoices").select("payload");
if (invoiceError) throw invoiceError;

const target = {};
for (const table of [
  "clients",
  "leads",
  "projects",
  "project_assignments",
  "project_milestones",
  "partnerships",
  "agreements",
  "invoices",
  "invoice_lines",
  "transactions",
  "payments",
  "expenses",
  "recurring_expenses",
  "salaries",
  "documents",
  "calendar",
  "notifications",
  "activity_logs",
  "valuation_snapshots",
  "team_members",
]) {
  target[table] = await targetRows(table);
}

const uniquePaymentIds = new Set([
  ...array(ops.payments).map((payment) => payment.id),
  ...array(ops.projects).flatMap((project) => array(project.payments).map((payment) => payment.id)),
]);
const uniqueTeamIds = new Set([
  ...array(company.companyMembers).map((member) => member.id),
  ...array(ops.founders).map((founder) => founder.id),
]);
const expected = {
  clients: array(ops.clients).length,
  leads: array(ops.leads).length + array(ops.contacts).length,
  projects: array(ops.projects).length,
  partnerships: array(ops.partnerships).length,
  agreements: array(docs.agreements).length,
  invoices: array(invoiceRows).length,
  transactions: array(ops.transactions).length,
  payments: uniquePaymentIds.size,
  recurring_expenses: array(ops.fixedMonthlyExpenses).filter((item) => item.kind !== "salary")
    .length,
  calendar: array(ops.scheduleEvents).length,
  notifications: array(ops.notifications).length,
  activity_logs: array(logs.entries).length + array(ops.valuationAudit).length,
  valuation_snapshots: array(ops.valuationSnapshots).length,
  team_members: uniqueTeamIds.size,
};

const checks = [];
function check(name, expectedValue, actualValue) {
  const ok = expectedValue === actualValue;
  checks.push({ name, expected: expectedValue, actual: actualValue, ok });
}
for (const [table, expectedCount] of Object.entries(expected)) {
  check(`${table} count`, expectedCount, target[table].length);
}

check(
  "project assignments count",
  array(ops.projects).reduce((sum, project) => {
    const ids = array(project.assignedMembers).length
      ? project.assignedMembers
      : project.assignedPartner
        ? [project.assignedPartner]
        : [];
    return sum + new Set(ids).size;
  }, 0),
  target.project_assignments.length,
);
check(
  "project milestones count",
  array(ops.projects).reduce((sum, project) => sum + array(project.milestones).length, 0),
  target.project_milestones.length,
);
check(
  "invoice lines count",
  array(invoiceRows).reduce((sum, row) => sum + array(row.payload?.items).length, 0),
  target.invoice_lines.length,
);

const invalidRelationships = {
  projects_without_client: target.projects.filter((row) => !row.client_id).length,
  invoices_without_client: target.invoices.filter((row) => !row.client_id).length,
  payments_without_client: target.payments.filter((row) => !row.client_id).length,
  current_payments_without_transaction: target.payments.filter(
    (row) => !row.historical && !row.transaction_id,
  ).length,
  assignments_without_ends: target.project_assignments.filter(
    (row) => !row.project_id || !row.team_member_id,
  ).length,
};
for (const [name, actual] of Object.entries(invalidRelationships)) {
  check(name, 0, actual);
}

const legacyTransactionTotal = round(
  array(ops.transactions).reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0),
);
const targetTransactionTotal = round(
  target.transactions.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0),
);
check("transaction amount total", legacyTransactionTotal, targetTransactionTotal);

const legacyPaymentTotal = round(
  [...uniquePaymentIds].reduce((sum, id) => {
    const payment =
      array(ops.payments).find((candidate) => candidate.id === id) ??
      array(ops.projects)
        .flatMap((project) => array(project.payments))
        .find((candidate) => candidate.id === id);
    return sum + Number(payment?.amount || 0);
  }, 0),
);
const targetPaymentTotal = round(
  target.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
);
check("payment amount total", legacyPaymentTotal, targetPaymentTotal);

const legacyInvoiceTotal = round(
  array(invoiceRows).reduce((sum, row) => {
    const invoice = row.payload ?? {};
    const subtotal = array(invoice.items).reduce(
      (itemSum, item) => itemSum + Number(item.quantity || 0) * Number(item.rate || 0),
      0,
    );
    return sum + subtotal + subtotal * (Number(invoice.taxPercent || 0) / 100);
  }, 0),
);
const invoiceLinesByInvoice = new Map();
for (const line of target.invoice_lines) {
  invoiceLinesByInvoice.set(
    line.invoice_id,
    (invoiceLinesByInvoice.get(line.invoice_id) ?? 0) +
      Number(line.quantity || 0) * Number(line.rate || 0),
  );
}
const targetInvoiceTotal = round(
  target.invoices.reduce((sum, invoice) => {
    const subtotal = invoiceLinesByInvoice.get(invoice.id) ?? 0;
    return sum + subtotal + subtotal * (Number(invoice.tax_percent || 0) / 100);
  }, 0),
);
check("invoice gross total", legacyInvoiceTotal, targetInvoiceTotal);

const failed = checks.filter((entry) => !entry.ok);
console.log("\nRelational migration validation");
for (const entry of checks) {
  console.log(
    `${entry.ok ? "PASS" : "FAIL"} ${entry.name}: expected=${entry.expected} actual=${entry.actual}`,
  );
}

const { data: migrationIssues, error: issuesError } = await relational
  .from("migration_issues")
  .select("severity,issue_code,message,source_collection,source_id")
  .is("resolved_at", null);
if (issuesError) throw issuesError;
console.log(`\nUnresolved migration issues: ${migrationIssues?.length ?? 0}`);
for (const entry of migrationIssues ?? []) {
  console.log(
    `- [${entry.severity}] ${entry.source_collection}/${entry.source_id}: ${entry.issue_code} — ${entry.message}`,
  );
}

if (failed.length || (migrationIssues ?? []).some((entry) => entry.severity === "error")) {
  process.exitCode = 1;
} else {
  console.log("\nAll count, relationship, invoice, payment and transaction checks passed.");
}
