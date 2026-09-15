/* Read-only diagnostic: prints billing/payment fields for every revenue
   project so contract-value/outstanding bugs can be diagnosed precisely. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { requireEgressAck } from './lib/egress-guard.mjs';
requireEgressAck("inspect-project-billing.mjs");

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
const { data, error } = await sb
  .from("operations_data")
  .select("payload")
  .eq("id", "default")
  .maybeSingle();
if (error) throw error;

const ops = data?.payload ?? {};
for (const p of ops.projects ?? []) {
  console.log(`--- ${p.id} | client="${p.client}" | name=${p.name ?? "-"} | status=${p.status}`);
  console.log(`    revenueValue=${JSON.stringify(p.revenueValue)}`);
  console.log(`    billing=${JSON.stringify(p.billing)}`);
  console.log(
    `    historicalReceived=${p.historicalReceived ?? "-"} | historicalOutstanding=${p.historicalOutstanding === null ? "null" : (p.historicalOutstanding ?? "-")}`,
  );
  const payments = (p.payments ?? []).map((x) => `${x.date}:${x.amount}`).join(", ");
  console.log(`    payments=[${payments}]`);
}
