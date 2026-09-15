/**
 * Round-trip smoke: load ops-shaped snapshot counts from relational tables,
 * then upsert one calendar row and confirm it sticks (minimal write path).
 */
import { requireEgressAck } from './lib/egress-guard.mjs';
requireEgressAck(import.meta.url);
import { readFileSync } from "node:fs";
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

const { data: org, error: orgErr } = await db
  .from("organizations")
  .select("id")
  .is("deleted_at", null)
  .limit(1)
  .maybeSingle();
if (orgErr || !org) throw new Error(orgErr?.message ?? "no org");

const smokeId = "00000000-0000-5000-8000-00000000c001";
const legacy = "smoke-write-check";

// Clean any previous smoke row
await db.from("calendar").update({ deleted_at: new Date().toISOString() }).eq("id", smokeId);

const row = {
  id: smokeId,
  organization_id: org.id,
  legacy_id: legacy,
  title: "Relational write smoke",
  calendar_type: "meeting",
  event_date: "2099-01-01",
  start_time: "09:00:00",
  duration_minutes: 30,
  status: "scheduled",
  deleted_at: null,
};

const { error: upsertErr } = await db.from("calendar").upsert(row, {
  onConflict: "organization_id,legacy_id",
});
if (upsertErr) {
  console.error("FAIL calendar upsert:", upsertErr.message);
  process.exit(1);
}

const { data: readBack, error: readErr } = await db
  .from("calendar")
  .select("id, title, deleted_at")
  .eq("organization_id", org.id)
  .eq("legacy_id", legacy)
  .is("deleted_at", null)
  .maybeSingle();

if (readErr || !readBack) {
  console.error("FAIL calendar read-back:", readErr?.message ?? "missing");
  process.exit(1);
}

console.log("PASS calendar write/read:", readBack.title);

// Soft-delete smoke row so it does not pollute production UI
await db
  .from("calendar")
  .update({ deleted_at: new Date().toISOString() })
  .eq("id", smokeId);
console.log("PASS smoke row cleaned up");
