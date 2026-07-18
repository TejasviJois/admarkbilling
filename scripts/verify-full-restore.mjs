import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
import crypto from "crypto";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const secret =
  env.APP_SESSION_SECRET ||
  "admark-dev-only-session-secret-change-with-APP_SESSION_SECRET";

function decrypt(encryptedText) {
  if (!encryptedText || !String(encryptedText).includes(":")) return encryptedText;
  try {
    const key = crypto.createHash("sha256").update(secret).digest();
    const parts = String(encryptedText).split(":");
    const iv = Buffer.from(parts[0], "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    let d = decipher.update(parts[1], "hex", "utf8");
    d += decipher.final("utf8");
    return d;
  } catch {
    return encryptedText;
  }
}

function decryptOps(ops) {
  return {
    ...ops,
    clients: ops.clients?.map((cl) => ({
      ...cl,
      phone: decrypt(cl.phone),
      email: decrypt(cl.email),
      gstNumber: cl.gstNumber ? decrypt(cl.gstNumber) : undefined,
      pan: cl.pan ? decrypt(cl.pan) : undefined,
      billingAddress: decrypt(cl.billingAddress),
      shippingAddress: cl.shippingAddress
        ? decrypt(cl.shippingAddress)
        : undefined,
    })),
    contacts: ops.contacts?.map((c) => ({
      ...c,
      phone: c.phone ? decrypt(c.phone) : undefined,
    })),
  };
}

function parseFirstRupee(text) {
  const m = String(text).match(/₹\s*([\d,]+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseKAmount(text) {
  const k = String(text).match(/₹?\s*([\d,]+(?:\.\d+)?)\s*[kK]/);
  if (!k) return null;
  const n = Number(k[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n * 1000 : null;
}

function parseBillingFromRevenueValue(revenueValue) {
  const text = revenueValue?.trim() ?? "";
  if (!text) return {};
  const monthlyOnly = text.match(/₹?\s*([\d,]+(?:\.\d+)?)\s*\/?\s*month/i);
  if (monthlyOnly && !text.includes("+")) {
    const amt = parseKAmount(text) ?? parseFirstRupee(text);
    const monthsMatch = text.match(/(?:for|x|×)\s*(\d+)\s*months?/i);
    return {
      monthlyAmount: amt ?? undefined,
      monthlyMonths: monthsMatch ? Number(monthsMatch[1]) : undefined,
    };
  }
  const upfront = parseFirstRupee(text);
  const afterPlus = text.split("+")[1];
  const monthly = afterPlus
    ? parseKAmount(afterPlus) ?? parseFirstRupee(afterPlus)
    : null;
  const monthsMatch = text.match(/(?:for|x|×)\s*(\d+)\s*months?/i);
  const billing = {};
  if (upfront != null && !text.toLowerCase().includes("/month"))
    billing.upfrontAmount = upfront;
  if (monthly != null) {
    billing.monthlyAmount = monthly;
    if (monthsMatch) billing.monthlyMonths = Number(monthsMatch[1]);
  }
  return billing;
}

function resolveBilling(project) {
  const explicit = project.billing || {};
  const parsed = parseBillingFromRevenueValue(project.revenueValue);
  return {
    ...parsed,
    ...explicit,
    monthlyAmount: explicit.monthlyAmount ?? parsed.monthlyAmount,
    monthlyMonths: explicit.monthlyMonths ?? parsed.monthlyMonths,
    monthlyStartDate: explicit.monthlyStartDate ?? parsed.monthlyStartDate,
    monthlyEndDate: explicit.monthlyEndDate,
  };
}

function recurringStatus(billing, asOfDate) {
  if (!billing.monthlyAmount) return "none";
  if (billing.monthlyEndDate && billing.monthlyEndDate <= asOfDate) return "ended";
  if (!billing.monthlyStartDate || billing.monthlyStartDate > asOfDate)
    return "not_started";
  if (billing.monthlyMonths != null) {
    const start = new Date(`${billing.monthlyStartDate}T12:00:00`);
    const asOf = new Date(`${asOfDate}T12:00:00`);
    const monthsElapsed =
      (asOf.getFullYear() - start.getFullYear()) * 12 +
      (asOf.getMonth() - start.getMonth());
    if (monthsElapsed >= billing.monthlyMonths) return "ended";
  }
  return "active";
}

function sumActiveMrr(projects, asOfDate) {
  let total = 0;
  const rows = [];
  for (const project of projects || []) {
    if (project.status !== "ongoing" && project.status !== "done") continue;
    const billing = resolveBilling(project);
    const status = recurringStatus(billing, asOfDate);
    const amount = status === "active" ? billing.monthlyAmount || 0 : 0;
    if (billing.monthlyAmount) {
      rows.push({
        name: project.name,
        status: project.status,
        recurringStatus: status,
        monthlyAmount: billing.monthlyAmount,
        monthlyStartDate: billing.monthlyStartDate,
        activeMrr: amount,
      });
    }
    total += amount;
  }
  return { total, rows };
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const backup = JSON.parse(
  readFileSync(
    "C:/Users/Tejasvi Jois/Desktop/admark_agency_os_backup_2026-07-18.json",
    "utf8",
  ),
);

const { data: row } = await sb
  .from("operations_data")
  .select("payload,updated_at")
  .eq("id", "default")
  .single();
const ops = decryptOps(row.payload);
const { data: docsRow } = await sb
  .from("operations_data")
  .select("payload")
  .eq("id", "documents")
  .single();
const { data: logsRow } = await sb
  .from("operations_data")
  .select("payload")
  .eq("id", "activity_logs")
  .single();
const { data: companyRow } = await sb
  .from("company_settings")
  .select("payload")
  .eq("id", "default")
  .single();
const { data: invoices } = await sb.from("invoices").select("id");

const baseline = ops.financialBaseline;
const txs = (ops.transactions || []).filter((t) => !t.historical);
const clientPayments = txs.filter(
  (t) => t.type === "client_payment" || t.type === "refund",
);
const newRev = clientPayments.reduce(
  (s, t) => s + (t.type === "refund" ? -Math.abs(t.amount) : t.amount),
  0,
);
const cashAdj = txs
  .filter((t) => t.type === "adjustment")
  .reduce((s, t) => s + t.amount, 0);
const founderInv = txs
  .filter((t) => t.type === "founder_investment")
  .reduce((s, t) => s + t.amount, 0);
const expenses = txs.filter((t) => t.type === "expense");
const newExt = expenses
  .filter((t) => t.category === "external_payout")
  .reduce((s, t) => s + t.amount, 0);
const newCo = expenses
  .filter((t) => t.category !== "external_payout")
  .reduce((s, t) => s + t.amount, 0);
const founderWd = txs
  .filter((t) => t.type === "founder_withdrawal")
  .reduce((s, t) => s + t.amount, 0);
const cash = cashAdj + newRev + founderInv - (newExt + newCo + founderWd);
const revenue = baseline.totalRevenueReceived + newRev;
const asOf = new Date().toISOString().slice(0, 10);
const mrr = sumActiveMrr(ops.projects, asOf);

const expected = backup.data.operations;
const pageChecks = {};
for (const p of ["/accounts", "/leads", "/directory", "/clients", "/projects"]) {
  try {
    const r = await fetch(`http://localhost:3002${p}`, { redirect: "manual" });
    pageChecks[p] = {
      status: r.status,
      location: r.headers.get("location"),
      reachable: r.status === 200 || r.status === 307 || r.status === 302,
    };
  } catch (e) {
    pageChecks[p] = { reachable: false, error: e.message };
  }
}

const checks = [
  ["contacts", ops.contacts?.length === 49],
  ["leads", ops.leads?.length === 1],
  ["clients", ops.clients?.length === 13],
  ["projects", ops.projects?.length === 12],
  ["transactions", ops.transactions?.length === 10],
  ["expenses", (ops.expenses?.length ?? 0) === 0],
  ["payments", ops.payments?.length === 10],
  ["activityLogs", logsRow.payload.entries?.length === 100],
  ["documents.agreements", (docsRow.payload.agreements?.length ?? 0) === 0],
  ["invoices", invoices.length === 2],
  ["company", companyRow.payload.name === "Admark Digitals"],
  ["cash", Math.abs(cash - 46966.42) < 0.01],
  ["revenue", revenue === 147425],
  ["baseline", baseline.totalRevenueReceived === 147425],
  [
    "idsMatchBackup",
    JSON.stringify((ops.projects || []).map((p) => p.id).sort()) ===
      JSON.stringify((expected.projects || []).map((p) => p.id).sort()),
  ],
  [
    "pagesReachable",
    Object.values(pageChecks).every((p) => p.reachable),
  ],
];

const report = {
  verdict: checks.every(([, pass]) => pass) ? "PASS" : "FAIL",
  restoredCounts: {
    contacts: ops.contacts?.length ?? 0,
    leads: ops.leads?.length ?? 0,
    clients: ops.clients?.length ?? 0,
    projects: ops.projects?.length ?? 0,
    transactions: ops.transactions?.length ?? 0,
    expenses: ops.expenses?.length ?? 0,
    payments: ops.payments?.length ?? 0,
    activityLogs: logsRow.payload.entries?.length ?? 0,
    agreements: docsRow.payload.agreements?.length ?? 0,
    invoices: invoices.length,
  },
  finance: {
    cashBalance: cash,
    totalRevenueReceived: revenue,
    activeMrr: mrr.total,
    mrrBreakdown: mrr.rows,
  },
  pageChecks,
  checks: checks.map(([name, pass]) => ({ name, pass })),
  updated_at: row.updated_at,
};

writeFileSync(
  "backups/full-restore-verification-final.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.verdict === "PASS" ? 0 : 1;
