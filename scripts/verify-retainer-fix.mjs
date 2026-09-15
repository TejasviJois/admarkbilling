/* Read-only check: recompute paymentSummary + billing figures for the live
   projects using the real app code, to verify retainer/contract-value fixes. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { requireEgressAck } from './lib/egress-guard.mjs';
requireEgressAck("verify-retainer-fix.mjs");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

for (const line of readFileSync(resolve(root, ".env"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const outfile = resolve(root, "scripts/.retainer-check-bundle.mjs");
await build({
  stdin: {
    contents: `
      export { paymentSummary, estimatedPending } from "@/lib/project-payments";
      export { projectContractValue, activeMrr, futureMonthlyRevenue, computeBookedRevenue } from "@/lib/project-billing";
    `,
    resolveDir: root,
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile,
  alias: { "@": resolve(root, "src") },
  define: { "import.meta.env": JSON.stringify({}) },
});

const lib = await import(pathToFileURL(outfile).href);

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

const asOf = new Date().toISOString().slice(0, 10);
let totalOutstanding = 0;
for (const p of data.payload.projects ?? []) {
  const s = lib.paymentSummary(p);
  const est = lib.estimatedPending(p);
  if (["active", "completed"].includes(p.status)) totalOutstanding += est;
  console.log(
    `${(p.name ?? p.client).padEnd(30)} contract=${String(s.target).padEnd(8)} received=${String(s.received).padEnd(8)} pending=${String(s.pending).padEnd(8)} estPending=${String(est).padEnd(8)} booked=${lib.computeBookedRevenue(p, asOf)} mrr=${lib.activeMrr(p, asOf)} futureMonthly=${lib.futureMonthlyRevenue(p, asOf)}`,
  );
}
console.log(`\nDashboard Outstanding (revenue projects): ${totalOutstanding}`);
