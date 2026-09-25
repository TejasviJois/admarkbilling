import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { requireEgressAck } from "./lib/egress-guard.mjs";

requireEgressAck("verify-directory-counts.mjs");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(resolve(root, ".env"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws },
});
const db = sb.schema("admark");
const { data: orgs } = await db.from("organizations").select("id, legacy_id").limit(5);
const org = (orgs ?? []).find((o) => o.legacy_id === "org_default") ?? (orgs ?? [])[0];

const { count: active } = await db
  .from("leads")
  .select("id", { count: "exact", head: true })
  .eq("organization_id", org.id)
  .eq("source", "Directory")
  .is("deleted_at", null);

const { count: deleted } = await db
  .from("leads")
  .select("id", { count: "exact", head: true })
  .eq("organization_id", org.id)
  .eq("source", "Directory")
  .not("deleted_at", "is", null);

console.log("Active Directory:", active);
console.log("Soft-deleted Directory:", deleted);

// Soft-delete any leftover active Directory rows that aren't from this replace
// (in case prior select was capped at 1000).
if ((active ?? 0) > 962) {
  const now = new Date().toISOString();
  let leftover = 0;
  for (;;) {
    const { data: rows, error } = await db
      .from("leads")
      .select("id, created_at")
      .eq("organization_id", org.id)
      .eq("source", "Directory")
      .is("deleted_at", null)
      .lt("created_at", now.slice(0, 10)) // older than today's replace batch date portion — weak
      .limit(500);
    if (error) throw error;
    if (!rows?.length) break;
    // Better: delete all active except those created in last few minutes
    break;
  }
  void leftover;
}

// Clean leftover actives older than the import window (created before replace run).
const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
const { data: stale } = await db
  .from("leads")
  .select("id")
  .eq("organization_id", org.id)
  .eq("source", "Directory")
  .is("deleted_at", null)
  .lt("created_at", cutoff)
  .limit(2000);

if (stale?.length) {
  const now = new Date().toISOString();
  for (let i = 0; i < stale.length; i += 200) {
    const chunk = stale.slice(i, i + 200).map((r) => r.id);
    await db.from("leads").update({ deleted_at: now }).in("id", chunk);
  }
  console.log("Soft-deleted leftover stale actives:", stale.length);
}

const { count: activeAfter } = await db
  .from("leads")
  .select("id", { count: "exact", head: true })
  .eq("organization_id", org.id)
  .eq("source", "Directory")
  .is("deleted_at", null);

console.log("Active Directory after cleanup:", activeAfter);

await sb.from("operations_data").update({ updated_at: new Date().toISOString() }).eq("id", "default");
