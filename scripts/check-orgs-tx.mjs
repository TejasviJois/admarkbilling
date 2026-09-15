import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { requireEgressAck } from './lib/egress-guard.mjs';
requireEgressAck("check-orgs-tx.mjs");

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

const { data: orgs } = await db.from("organizations").select("id, legacy_id, name, deleted_at");
console.log("orgs", orgs);

for (const org of orgs ?? []) {
  const { count } = await db
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org.id)
    .is("deleted_at", null);
  console.log(org.legacy_id, org.name, "tx", count);
}

// Simulate what UI would show if dateTo were Aug 21
const { data: ops } = await sb.from("operations_data").select("payload, updated_at").eq("id", "default").maybeSingle();
const txs = ops?.payload?.transactions ?? [];
console.log("blob updated_at", ops?.updated_at);
console.log("blob txs", txs.length);
console.log(
  "blob <= Aug21",
  txs.filter((t) => t.date <= "2026-08-21").length,
);
console.log(
  "blob > Aug21",
  txs.filter((t) => t.date > "2026-08-21").length,
);
