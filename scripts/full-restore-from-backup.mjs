import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { decrypt, encrypt } from "../shared/encryption-core.mjs";
import { requireEgressAck } from './lib/egress-guard.mjs';
requireEgressAck("full-restore-from-backup.mjs");

const ORG = "org-admark-digitals";
const BACKUP_PATH =
  "C:/Users/Tejasvi Jois/Desktop/admark_agency_os_backup_2026-07-18.json";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
process.env.APP_SESSION_SECRET =
  env.APP_SESSION_SECRET || process.env.APP_SESSION_SECRET;

function encryptOps(ops) {
  const clients = ops.clients?.map((cl) => ({
    ...cl,
    phone: encrypt(cl.phone ?? ""),
    email: encrypt(cl.email ?? ""),
    gstNumber: cl.gstNumber ? encrypt(cl.gstNumber) : undefined,
    pan: cl.pan ? encrypt(cl.pan) : undefined,
    billingAddress: encrypt(cl.billingAddress ?? ""),
    shippingAddress: cl.shippingAddress
      ? encrypt(cl.shippingAddress)
      : undefined,
  }));
  const contacts = ops.contacts?.map((contact) => ({
    ...contact,
    phone: contact.phone ? encrypt(contact.phone) : undefined,
  }));
  return { ...ops, clients, contacts };
}

function decryptOps(ops) {
  const clients = ops.clients?.map((cl) => ({
    ...cl,
    phone: decrypt(cl.phone),
    email: decrypt(cl.email),
    gstNumber: cl.gstNumber ? decrypt(cl.gstNumber) : undefined,
    pan: cl.pan ? decrypt(cl.pan) : undefined,
    billingAddress: decrypt(cl.billingAddress),
    shippingAddress: cl.shippingAddress
      ? decrypt(cl.shippingAddress)
      : undefined,
  }));
  const contacts = ops.contacts?.map((contact) => ({
    ...contact,
    phone: contact.phone ? decrypt(contact.phone) : undefined,
  }));
  return { ...ops, clients, contacts };
}

function encryptCompany(c) {
  return {
    ...c,
    address: encrypt(c.address ?? ""),
    pan: c.pan ? encrypt(c.pan) : undefined,
    gstin: c.gstin ? encrypt(c.gstin) : undefined,
    bankName: c.bankName ? encrypt(c.bankName) : undefined,
    accountName: c.accountName ? encrypt(c.accountName) : undefined,
    accountNumber: c.accountNumber ? encrypt(c.accountNumber) : undefined,
    ifsc: c.ifsc ? encrypt(c.ifsc) : undefined,
    branch: c.branch ? encrypt(c.branch) : undefined,
    upi: c.upi ? encrypt(c.upi) : undefined,
  };
}

function encryptInvoice(inv) {
  return {
    ...inv,
    clientAddress: inv.clientAddress ? encrypt(inv.clientAddress) : undefined,
    clientPhone: inv.clientPhone ? encrypt(inv.clientPhone) : undefined,
    clientEmail: inv.clientEmail ? encrypt(inv.clientEmail) : undefined,
    clientGstin: inv.clientGstin ? encrypt(inv.clientGstin) : undefined,
  };
}

function computeCashAndRevenue(ops) {
  const baseline = ops.financialBaseline;
  const txs = (ops.transactions ?? []).filter((t) => !t.historical);
  const clientPayments = txs.filter(
    (t) => t.type === "client_payment" || t.type === "refund",
  );
  const revenueAmount = (t) =>
    t.type === "refund" ? -Math.abs(t.amount) : t.amount;
  const newRevenueAfterBaseline = clientPayments.reduce(
    (sum, t) => sum + revenueAmount(t),
    0,
  );
  const totalRevenueReceived =
    (baseline?.totalRevenueReceived ?? 0) + newRevenueAfterBaseline;
  const expenses = txs.filter((t) => t.type === "expense");
  const newExternalPayouts = expenses
    .filter((t) => t.category === "external_payout")
    .reduce((sum, t) => sum + t.amount, 0);
  const newCompanyExpenses = expenses
    .filter((t) => t.category !== "external_payout")
    .reduce((sum, t) => sum + t.amount, 0);
  const founderWithdrawals = txs
    .filter((t) => t.type === "founder_withdrawal")
    .reduce((sum, t) => sum + t.amount, 0);
  const founderInvestments = txs
    .filter((t) => t.type === "founder_investment")
    .reduce((sum, t) => sum + t.amount, 0);
  const cashAdjustments = txs
    .filter((t) => t.type === "adjustment")
    .reduce((sum, t) => sum + t.amount, 0);
  const newExpenseTotal =
    newExternalPayouts + newCompanyExpenses + founderWithdrawals;
  const currentCashBalance =
    cashAdjustments +
    newRevenueAfterBaseline +
    founderInvestments -
    newExpenseTotal;
  return { currentCashBalance, totalRevenueReceived, baseline };
}

/** Minimal MRR: monthlyAmount retainers that have started and not ended. */
function sumActiveMrr(projects, asOfDate) {
  let total = 0;
  for (const project of projects ?? []) {
    if (project.status !== "ongoing" && project.status !== "done") continue;
    const billing = project.billing ?? {};
    const monthly = billing.monthlyAmount;
    if (!monthly) continue;
    if (billing.monthlyEndDate && billing.monthlyEndDate <= asOfDate) continue;
    if (!billing.monthlyStartDate || billing.monthlyStartDate > asOfDate)
      continue;
    if (billing.monthlyMonths != null) {
      const start = new Date(`${billing.monthlyStartDate}T12:00:00`);
      const asOf = new Date(`${asOfDate}T12:00:00`);
      const monthsElapsed =
        (asOf.getFullYear() - start.getFullYear()) * 12 +
        (asOf.getMonth() - start.getMonth());
      if (monthsElapsed >= billing.monthlyMonths) continue;
    }
    total += monthly;
  }
  return total;
}

function counts(ops, documents, activityLogs, invoices, company) {
  return {
    contacts: ops.contacts?.length ?? 0,
    leads: ops.leads?.length ?? 0,
    clients: ops.clients?.length ?? 0,
    projects: ops.projects?.length ?? 0,
    transactions: ops.transactions?.length ?? 0,
    expenses: ops.expenses?.length ?? 0,
    payments: ops.payments?.length ?? 0,
    partnerships: ops.partnerships?.length ?? 0,
    founders: ops.founders?.length ?? 0,
    fixedMonthlyExpenses: ops.fixedMonthlyExpenses?.length ?? 0,
    agreements: documents.agreements?.length ?? 0,
    archiveDocuments: documents.archiveDocuments?.length ?? 0,
    activityLogs: activityLogs.length,
    invoices: invoices.length,
    companyName: company?.name ?? null,
    financialBaseline: !!ops.financialBaseline,
  };
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const nowIso = new Date().toISOString();
const stamp = nowIso.replace(/[:.]/g, "-");
mkdirSync("backups", { recursive: true });

// --- 1) Backup CURRENT state ---
const { data: opsRows, error: opsErr } = await sb
  .from("operations_data")
  .select("id, updated_at, payload")
  .in("id", ["default", "documents", "activity_logs"]);
if (opsErr) throw opsErr;
const { data: companyRows, error: cErr } = await sb
  .from("company_settings")
  .select("*");
if (cErr) throw cErr;
const { data: invoiceRows, error: iErr } = await sb.from("invoices").select("*");
if (iErr) throw iErr;

const preBackup = {
  createdAt: nowIso,
  purpose: "pre-full-restore-from-admark_agency_os_backup_2026-07-18",
  sourceBackup: BACKUP_PATH,
  operations_data: opsRows,
  company_settings: companyRows,
  invoices: invoiceRows,
};
const prePath = resolve("backups", `pre-full-restore-${stamp}.json`);
writeFileSync(prePath, JSON.stringify(preBackup));

const currentDefault = opsRows.find((r) => r.id === "default")?.payload || {};
const currentDocs = opsRows.find((r) => r.id === "documents")?.payload || {};
const currentLogs =
  opsRows.find((r) => r.id === "activity_logs")?.payload?.entries || [];
const backupExportTs = Date.parse("2026-07-18T12:03:36.848Z");
const lostActivity = currentLogs.filter((e) => e.timestamp > backupExportTs);
const lostNamedProjects = (currentDefault.projects || [])
  .filter((p) => /^(Blue Blocks|Management Software)$/i.test(p.name || ""))
  .map((p) => ({ id: p.id, name: p.name, status: p.status }));

const beforeCounts = {
  contacts: currentDefault.contacts?.length ?? 0,
  leads: currentDefault.leads?.length ?? 0,
  clients: currentDefault.clients?.length ?? 0,
  projects: currentDefault.projects?.length ?? 0,
  transactions: currentDefault.transactions?.length ?? 0,
  expenses: currentDefault.expenses?.length ?? 0,
  payments: currentDefault.payments?.length ?? 0,
  activityLogs: currentLogs.length,
  agreements: currentDocs.agreements?.length ?? 0,
  invoices: invoiceRows?.length ?? 0,
};

// --- 2) Load restore source ---
const full = JSON.parse(readFileSync(BACKUP_PATH, "utf8"));
if (full.format !== "admark-os-full-system-backup") {
  throw new Error("Unexpected backup format: " + full.format);
}
const ops = structuredClone(full.data.operations);
const documents = structuredClone(
  full.data.documents ?? { agreements: [], archiveDocuments: [] },
);
const activityLogs = structuredClone(full.data.activityLogs ?? []);
const company = structuredClone(full.data.companySettings);
const invoices = structuredClone(full.data.invoices ?? []);
if (!ops || !company) throw new Error("Backup missing operations or companySettings");
if (!Array.isArray(documents.agreements)) documents.agreements = [];
if (!Array.isArray(documents.archiveDocuments)) documents.archiveDocuments = [];

const expected = counts(ops, documents, activityLogs, invoices, company);
const expectedFinance = computeCashAndRevenue(ops);
const asOf = new Date().toISOString().slice(0, 10);
const expectedMrr = sumActiveMrr(ops.projects, asOf);

const encryptedOps = encryptOps(ops);
const opsPayload = { ...encryptedOps, organizationId: ORG };
const docsPayload = { ...documents, organizationId: ORG };
const logsPayload = {
  entries: activityLogs.map((e) => ({ ...e, organizationId: ORG })),
  organizationId: ORG,
};
const companyPayload = { ...encryptCompany(company), organizationId: ORG };
const updatedAt = new Date().toISOString();

// --- 3) WRITE restores ---
{
  const { error } = await sb.from("operations_data").upsert({
    id: "default",
    payload: opsPayload,
    updated_at: updatedAt,
  });
  if (error) throw error;
}
{
  const { error } = await sb.from("operations_data").upsert({
    id: "documents",
    payload: docsPayload,
    updated_at: updatedAt,
  });
  if (error) throw error;
}
{
  const { error } = await sb.from("operations_data").upsert({
    id: "activity_logs",
    payload: logsPayload,
    updated_at: updatedAt,
  });
  if (error) throw error;
}
{
  const { error } = await sb.from("company_settings").upsert({
    id: "default",
    payload: companyPayload,
    updated_at: updatedAt,
  });
  if (error) throw error;
}

const backupInvoiceIds = new Set(invoices.map((i) => i.id));
for (const row of invoiceRows || []) {
  if (!backupInvoiceIds.has(row.id)) {
    const { error } = await sb.from("invoices").delete().eq("id", row.id);
    if (error) throw error;
  }
}
for (const inv of invoices) {
  const encrypted = encryptInvoice(inv);
  const payload = { ...encrypted, organizationId: ORG };
  const { error } = await sb.from("invoices").upsert({
    id: inv.id,
    payload,
    created_at: new Date(inv.createdAt || Date.now()).toISOString(),
  });
  if (error) throw error;
}

// --- 4) Verify from DB ---
const { data: verifyRows, error: vErr } = await sb
  .from("operations_data")
  .select("id, payload, updated_at")
  .in("id", ["default", "documents", "activity_logs"]);
if (vErr) throw vErr;
const { data: verifyCompany, error: vcErr } = await sb
  .from("company_settings")
  .select("payload")
  .eq("id", "default")
  .maybeSingle();
if (vcErr) throw vcErr;
const { data: verifyInvoices, error: viErr } = await sb.from("invoices").select("id, payload");
if (viErr) throw viErr;

const liveOps = decryptOps(
  verifyRows.find((r) => r.id === "default")?.payload || {},
);
const liveDocs = verifyRows.find((r) => r.id === "documents")?.payload || {};
const liveLogs =
  verifyRows.find((r) => r.id === "activity_logs")?.payload?.entries || [];
const liveCompany = verifyCompany?.payload || {};
const restored = counts(liveOps, liveDocs, liveLogs, verifyInvoices || [], liveCompany);
const finance = computeCashAndRevenue(liveOps);
const mrr = sumActiveMrr(liveOps.projects, asOf);

const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass: !!pass, detail });
}

check(
  "contacts",
  restored.contacts === expected.contacts,
  `${restored.contacts} (expected ${expected.contacts})`,
);
check(
  "leads",
  restored.leads === expected.leads,
  `${restored.leads} (expected ${expected.leads})`,
);
check(
  "clients",
  restored.clients === expected.clients,
  `${restored.clients} (expected ${expected.clients})`,
);
check(
  "projects",
  restored.projects === expected.projects,
  `${restored.projects} (expected ${expected.projects})`,
);
check(
  "transactions",
  restored.transactions === expected.transactions,
  `${restored.transactions} (expected ${expected.transactions})`,
);
check(
  "expenses",
  restored.expenses === expected.expenses,
  `${restored.expenses} (expected ${expected.expenses})`,
);
check(
  "payments",
  restored.payments === expected.payments,
  `${restored.payments} (expected ${expected.payments})`,
);
check(
  "activityLogs",
  restored.activityLogs === expected.activityLogs,
  `${restored.activityLogs} (expected ${expected.activityLogs})`,
);
check(
  "agreements",
  restored.agreements === expected.agreements,
  `${restored.agreements} (expected ${expected.agreements})`,
);
check(
  "invoices",
  restored.invoices === expected.invoices,
  `${restored.invoices} (expected ${expected.invoices})`,
);
check(
  "financialBaseline",
  restored.financialBaseline === true &&
    liveOps.financialBaseline?.totalRevenueReceived ===
      ops.financialBaseline?.totalRevenueReceived &&
    liveOps.financialBaseline?.asOfDate === ops.financialBaseline?.asOfDate,
  JSON.stringify(liveOps.financialBaseline),
);
check(
  "company",
  liveCompany.name === company.name,
  `${liveCompany.name} (expected ${company.name})`,
);
check(
  "cashBalance",
  Math.abs(finance.currentCashBalance - expectedFinance.currentCashBalance) <
    0.01,
  `₹${finance.currentCashBalance} (expected ₹${expectedFinance.currentCashBalance})`,
);
check(
  "revenue",
  Math.abs(finance.totalRevenueReceived - expectedFinance.totalRevenueReceived) <
    0.01,
  `₹${finance.totalRevenueReceived} (expected ₹${expectedFinance.totalRevenueReceived})`,
);
check(
  "mrr",
  Math.abs(mrr - expectedMrr) < 0.01,
  `₹${mrr}/mo (expected ₹${expectedMrr}/mo)`,
);

// Entity content smoke checks
const projectNames = (liveOps.projects || []).map((p) => p.name).sort();
const expectedProjectNames = (ops.projects || []).map((p) => p.name).sort();
check(
  "projectNamesMatch",
  JSON.stringify(projectNames) === JSON.stringify(expectedProjectNames),
  projectNames.join(" | "),
);
check(
  "leadShudhindra",
  (liveOps.leads || []).some((l) => /shudhindra/i.test(l.name || "")),
  (liveOps.leads || []).map((l) => l.name).join(", "),
);
check(
  "directoryContacts",
  restored.contacts === 49 &&
    (liveOps.contacts || []).some((c) => c.personName === "Vivek Kotari"),
  `first5=${(liveOps.contacts || [])
    .slice(0, 5)
    .map((c) => c.personName)
    .join(", ")}`,
);
check(
  "clientsHaveCompanyNames",
  (liveOps.clients || []).every((c) => !!c.companyName) &&
    restored.clients === 13,
  (liveOps.clients || []).map((c) => c.companyName).join(" | "),
);
check(
  "noBlueBlocks",
  !(liveOps.projects || []).some((p) => /blue blocks/i.test(p.name || "")),
  "Blue Blocks absent as expected",
);
check(
  "txOpeningBalance",
  (liveOps.transactions || []).some(
    (t) => t.id === "tx-gz-opening-balance" && t.amount === 46966.42,
  ),
  "opening balance present",
);

const allPass = checks.every((c) => c.pass);

const report = {
  verdict: allPass ? "PASS" : "FAIL",
  preRestoreBackup: prePath,
  sourceBackup: BACKUP_PATH,
  sourceExportedAt: full.metadata?.exportedAt,
  beforeCounts,
  restoredCounts: restored,
  expectedCounts: expected,
  finance: {
    cashBalance: finance.currentCashBalance,
    totalRevenueReceived: finance.totalRevenueReceived,
    baselineRevenueReceived: finance.baseline?.totalRevenueReceived,
    activeMrr: mrr,
  },
  intentionallyLostBecauseAfterBackup: {
    namedProjects: lostNamedProjects,
    activityLogEntries: lostActivity.map((e) => ({
      timestamp: new Date(e.timestamp).toISOString(),
      summary: e.summary,
    })),
    note:
      "Also discarded corrupted post-overwrite seed state (31 clients/projects with empty CRM arrays) in favor of backup snapshot.",
    discardedCorruptedVsBackup: {
      clients: beforeCounts.clients - expected.clients,
      projects: beforeCounts.projects - expected.projects,
      contactsRestoredFromEmpty: expected.contacts - beforeCounts.contacts,
      leadsRestoredFromEmpty: expected.leads - beforeCounts.leads,
    },
  },
  checks,
  liveUpdatedAt: {
    default: verifyRows.find((r) => r.id === "default")?.updated_at,
    documents: verifyRows.find((r) => r.id === "documents")?.updated_at,
    activity_logs: verifyRows.find((r) => r.id === "activity_logs")?.updated_at,
  },
};

const reportPath = resolve("backups", `full-restore-report-${stamp}.json`);
writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, reportPath }, null, 2));
if (!allPass) process.exitCode = 1;
