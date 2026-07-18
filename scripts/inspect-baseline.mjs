/* Read-only diagnostic: prints the stored financial baseline and every
   client-payment transaction so the Revenue KPI can be reconciled. */
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

const sb = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: ws } },
);
const { data, error } = await sb
  .from("operations_data")
  .select("payload")
  .eq("id", "default")
  .maybeSingle();
if (error) throw error;

const ops = data.payload;
console.log("financialBaseline =", JSON.stringify(ops.financialBaseline, null, 2));

let hist = 0;
let fresh = 0;
for (const t of ops.transactions ?? []) {
  if (t.type !== "client_payment" && t.type !== "refund") continue;
  const amt = t.type === "refund" ? -Math.abs(t.amount) : t.amount;
  if (t.historical) hist += amt;
  else fresh += amt;
  console.log(
    `${t.historical ? "HIST" : "NEW "} ${t.date} ${String(amt).padStart(8)}  ${t.description}`,
  );
}
console.log("\nhistorical client payments total =", hist);
console.log("post-migration client payments total =", fresh);
console.log(
  "Revenue KPI = baseline.totalRevenueReceived + post-migration =",
  (ops.financialBaseline?.totalRevenueReceived ?? 0) + fresh,
);
