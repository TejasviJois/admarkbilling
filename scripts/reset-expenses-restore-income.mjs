/**
 * Clear logged expenses + expense baseline; restore income baseline.
 * Run: node scripts/reset-expenses-restore-income.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULT_PAYMENT_STATUS = {
  "proj-rls-p": "Done",
  "proj-tah": "₹21,000 Received",
  "proj-kannan": "₹30,000 Received",
  "proj-a7-gtech": "Done",
  "proj-dev": "5,000 token",
  "proj-kh-kiran": "10,000 advance",
  "proj-powergate": "Send Doc",
  "proj-world-air": "15/16",
  "proj-nagendra": "15/16",
  "proj-suhalya": "21/22",
  "proj-gokashi": "16/17",
};

const RESTORED_BASELINE = {
  periodLabel: "Past two months (historical baseline)",
  asOfDate: "2026-06-11",
  totalRevenueBooked: null,
  totalHandoutsTaken: 0,
  totalRevenueReceived: 102_425,
  totalExternalPayouts: 0,
  totalCompanyExpenses: 0,
  founderPayoutPool: 0,
};

const PRAJWAL_EMI = {
  id: "fixed-prajwal-loan-emi",
  label: "Prajwal — company loan EMI",
  amountPerMonth: 20_000,
  kind: "emi",
  startDate: "2026-07-05",
  notes: "Handout / loan from Prajwal — not yet paid. First EMI due 5th of next month.",
  active: true,
};

function loadEnv() {
  const env = {};
  try {
    const raw = readFileSync(resolve(root, ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i <= 0) continue;
      env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
  } catch {
    /* no .env */
  }
  return env;
}

const env = { ...loadEnv(), ...process.env };
const url = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL)?.trim()?.replace(/\/$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function main() {
  const res = await fetch(`${url}/rest/v1/operations_data?id=eq.default&select=payload`, { headers });
  const rows = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(rows));

  const payload = rows[0]?.payload;
  if (!payload) throw new Error("No operations_data default row found.");

  const projects = (payload.projects ?? []).map((p) => ({
    ...p,
    paymentStatus: DEFAULT_PAYMENT_STATUS[p.id] ?? p.paymentStatus,
  }));

  const fixedMonthlyExpenses = [PRAJWAL_EMI];

  const next = {
    ...payload,
    projects,
    expenses: [],
    financialBaseline: RESTORED_BASELINE,
    fixedMonthlyExpenses,
  };

  const save = await fetch(`${url}/rest/v1/operations_data?id=eq.default`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ payload: next, updated_at: new Date().toISOString() }),
  });
  const saved = await save.json();
  if (!save.ok) throw new Error(JSON.stringify(saved));

  console.log("Done:");
  console.log("- Income baseline restored: totalRevenueReceived = ₹1,02,425");
  console.log("- All logged expenses cleared (re-enter in the app)");
  console.log("- Expense baseline reset to ₹0");
  console.log("- Handouts (Prajwal loan): ₹0 until EMI starts");
  console.log("- Prajwal EMI ₹20,000/mo from 2026-07-05");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
