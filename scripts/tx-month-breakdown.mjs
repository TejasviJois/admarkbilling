import { requireEgressAck } from './lib/egress-guard.mjs';
requireEgressAck(import.meta.url);
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

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

const { data: rows } = await db
  .from("transactions")
  .select("legacy_id, transaction_date, description, amount, historical, transaction_type, deleted_at")
  .eq("organization_id", org.id)
  .order("transaction_date");

const alive = (rows ?? []).filter((r) => !r.deleted_at);
const byMonth = {};
for (const r of alive) {
  const m = String(r.transaction_date).slice(0, 7);
  byMonth[m] = (byMonth[m] ?? 0) + 1;
}
console.log("by month", byMonth);
console.log("alive", alive.length);
console.log("Sep only", alive.filter((r) => String(r.transaction_date).startsWith("2026-09")).length);
console.log(
  "from Jul 17 (ground zero?) non-hist",
  alive.filter((r) => r.transaction_date >= "2026-07-17" && !r.historical).length,
);
console.log(
  "from Jul 17 all",
  alive.filter((r) => r.transaction_date >= "2026-07-17").length,
);
console.log(
  "before Aug 21",
  alive.filter((r) => r.transaction_date <= "2026-08-21").length,
);
console.log(
  "after Aug 21",
  alive.filter((r) => r.transaction_date > "2026-08-21").length,
);

// If UI defaulted to current month Sep: 
console.log("If filtered to 2026-09:", alive.filter((r) => String(r.transaction_date).startsWith("2026-09")).length);

// Check soft-deleted
console.log("soft-deleted", (rows ?? []).filter((r) => r.deleted_at).map((r) => r.legacy_id));
