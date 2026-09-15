import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { requireEgressAck } from './lib/egress-guard.mjs';
requireEgressAck("compare-tx-counts.mjs");

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

const { data: alive } = await db
  .from("transactions")
  .select("legacy_id, transaction_date, description, amount, historical")
  .eq("organization_id", org.id)
  .is("deleted_at", null)
  .order("transaction_date");

const { data: all } = await db
  .from("transactions")
  .select("legacy_id, deleted_at, historical")
  .eq("organization_id", org.id);

const { data: ops } = await sb
  .from("operations_data")
  .select("payload")
  .eq("id", "default")
  .maybeSingle();
const blobTx = Array.isArray(ops?.payload?.transactions) ? ops.payload.transactions : [];

console.log("relational alive", alive?.length);
console.log(
  "relational all",
  all?.length,
  "deleted",
  all?.filter((t) => t.deleted_at).length,
  "historical alive",
  alive?.filter((t) => t.historical).length,
);
console.log("blob tx", blobTx.length, "historical", blobTx.filter((t) => t.historical).length);

const blobIds = new Set(blobTx.map((t) => t.id));
const relIds = new Set((alive ?? []).map((t) => t.legacy_id));
console.log(
  "blob only",
  [...blobIds].filter((id) => !relIds.has(id)),
);
console.log(
  "rel only",
  [...relIds].filter((id) => !blobIds.has(id)),
);

const nonHistAlive = (alive ?? []).filter((t) => !t.historical);
console.log("non-historical alive", nonHistAlive.length);
console.log("44-32=12 — if deployed hides historical:", alive?.filter((t) => t.historical).length);
