import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { requireEgressAck } from './lib/egress-guard.mjs';
requireEgressAck("inspect-legacy-blobs.mjs");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(resolve(root, ".env"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});

console.log("RELATIONAL_READS", process.env.RELATIONAL_READS_ENABLED);
console.log("DUAL_WRITES", process.env.RELATIONAL_DUAL_WRITES_ENABLED);

const { data: ops } = await sb.from("operations_data").select("id, updated_at");
console.log("operations_data rows:", ops);

for (const row of ops ?? []) {
  const { data } = await sb
    .from("operations_data")
    .select("payload")
    .eq("id", row.id)
    .maybeSingle();
  const payload = data?.payload;
  const size = JSON.stringify(payload ?? null).length;
  const keys =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? Object.keys(payload)
      : [];
  console.log(`  ${row.id}: ${size} bytes, topKeys=${keys.slice(0, 12).join(",")}`);
}

const { data: co } = await sb.from("company_settings").select("id, updated_at");
console.log("company_settings:", co);
for (const row of co ?? []) {
  const { data } = await sb.from("company_settings").select("payload").eq("id", row.id).maybeSingle();
  console.log(`  ${row.id}: ${JSON.stringify(data?.payload ?? null).length} bytes`);
}

const { count } = await sb.from("invoices").select("id", { count: "exact", head: true });
console.log("public.invoices count:", count);

const db = sb.schema("admark");
const { count: relInv } = await db
  .from("invoices")
  .select("id", { count: "exact", head: true })
  .is("deleted_at", null);
console.log("admark.invoices alive:", relInv);
