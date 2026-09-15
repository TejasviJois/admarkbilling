import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { requireEgressAck } from './lib/egress-guard.mjs';
requireEgressAck("inspect-srivatsanka-dup.mjs");

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
const db = sb.schema("admark");
const { data: org } = await db.from("organizations").select("id").is("deleted_at", null).limit(1).maybeSingle();

const { data: project } = await db
  .from("projects")
  .select("id, display_name, legacy_id")
  .eq("organization_id", org.id)
  .eq("legacy_id", "proj-kannan")
  .maybeSingle();

const { data: pays } = await db
  .from("payments")
  .select("*")
  .eq("organization_id", org.id)
  .eq("project_id", project.id)
  .is("deleted_at", null);

const { data: txs } = await db
  .from("transactions")
  .select("id, legacy_id, amount, transaction_date, description, transaction_type, historical")
  .eq("organization_id", org.id)
  .eq("project_id", project.id)
  .is("deleted_at", null);

console.log("project", project);
console.log("payments", pays);
console.log("transactions", txs);

const { data: invPay } = await db
  .from("payments")
  .select("*")
  .eq("organization_id", org.id)
  .eq("legacy_id", "pay-0d5d21da")
  .maybeSingle();
console.log("invoice payment row", invPay);

const { data: lead } = await db
  .from("projects")
  .select("*")
  .eq("organization_id", org.id)
  .eq("legacy_id", "1da4faa0-b0ac-44d4-834b-27fc2d3ad65d")
  .maybeSingle();
console.log("Lead Management", {
  name: lead?.display_name,
  contract: lead?.contract_value,
  upfront: lead?.upfront_amount,
  histRec: lead?.historical_received,
  histOut: lead?.historical_outstanding,
  notes: lead?.notes,
});
