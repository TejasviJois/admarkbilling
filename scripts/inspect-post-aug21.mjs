import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { requireEgressAck } from './lib/egress-guard.mjs';
requireEgressAck("inspect-post-aug21.mjs");

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
const { data: org } = await db
  .from("organizations")
  .select("id")
  .is("deleted_at", null)
  .limit(1)
  .maybeSingle();

const { data: cal } = await db
  .from("calendar")
  .select("legacy_id, title, event_date, calendar_type, status, deleted_at")
  .eq("organization_id", org.id)
  .order("event_date");
console.log("All calendar rows (incl deleted):", cal?.length);
for (const row of cal ?? []) {
  console.log(
    `${row.deleted_at ? "DEL" : "OK "} ${row.event_date} ${row.calendar_type} ${row.legacy_id} ${row.title}`,
  );
}

const { data: tx } = await db
  .from("transactions")
  .select("legacy_id, transaction_date, description, amount, deleted_at")
  .eq("organization_id", org.id)
  .gt("transaction_date", "2026-08-21")
  .order("transaction_date");
console.log("\nTX after Aug21 (incl deleted):", tx?.length);
for (const row of tx ?? []) {
  console.log(
    `${row.deleted_at ? "DEL" : "OK "} ${row.transaction_date} ${row.amount} ${row.legacy_id} ${row.description}`,
  );
}
