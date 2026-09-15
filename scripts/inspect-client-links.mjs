/* Read-only diagnostic: prints client names/ids and project→client links
   from the live operations payload so broken links can be repaired precisely.
   No sensitive fields (phone/email/address) are printed. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { requireEgressAck } from './lib/egress-guard.mjs';
requireEgressAck("inspect-client-links.mjs");

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
if (!data?.payload) {
  console.log("No operations payload found.");
  process.exit(0);
}

const ops = data.payload;

console.log("=== CLIENTS ===");
for (const c of ops.clients ?? []) {
  console.log(
    `${c.id} | ${c.companyName} | parent=${c.parentClientId ?? "-"} | status=${c.status}`,
  );
}

console.log("\n=== PROJECTS ===");
for (const p of ops.projects ?? []) {
  console.log(
    `${p.id} | client="${p.client}" | clientId=${p.clientId ?? "-"} | status=${p.status} | name=${p.name ?? "-"}`,
  );
}

console.log("\n=== ACTIVE LEADS ===");
for (const l of ops.leads ?? []) {
  if (l.status === "won" || l.status === "lost") continue;
  console.log(`${l.id} | company="${l.company}" | name=${l.name ?? "-"} | status=${l.status}`);
}
