/**
 * One-time: clear all project income in Supabase (keeps expenses). Run:
 *   node scripts/reset-income-data.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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

  const expenseCount = Array.isArray(payload.expenses) ? payload.expenses.length : 0;
  const projectCount = Array.isArray(payload.projects) ? payload.projects.length : 0;

  const next = {
    ...payload,
    projects: (payload.projects ?? []).map((p) => ({
      ...p,
      payments: [],
      paymentProofs: undefined,
      paymentStatus: undefined,
    })),
    financialBaseline: payload.financialBaseline
      ? { ...payload.financialBaseline, totalRevenueReceived: 0 }
      : payload.financialBaseline,
  };

  const save = await fetch(`${url}/rest/v1/operations_data?id=eq.default`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ payload: next, updated_at: new Date().toISOString() }),
  });
  const saved = await save.json();
  if (!save.ok) throw new Error(JSON.stringify(saved));

  console.log(`Cleared income on ${projectCount} projects. Kept ${expenseCount} expense entries.`);
  console.log("Baseline totalRevenueReceived set to 0.");
  console.log("Re-upload payments with proof screenshots in the app.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
