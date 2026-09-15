/**
 * Fix calendar rows that were migrated as meetings but are reminders in the JSON blob.
 * Then re-apply full blob → relational migration.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { requireEgressAck } from './lib/egress-guard.mjs';
requireEgressAck("fix-reminder-calendar-types.mjs");

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

const { data: opsRow, error } = await sb
  .from("operations_data")
  .select("payload")
  .eq("id", "default")
  .maybeSingle();
if (error) throw error;

const events = Array.isArray(opsRow?.payload?.scheduleEvents) ? opsRow.payload.scheduleEvents : [];
const reminderIds = events.filter((e) => e?.type === "reminder" && e?.id).map((e) => String(e.id));
console.log("Reminder IDs in blob:", reminderIds.length, reminderIds);

const { data: org } = await db
  .from("organizations")
  .select("id")
  .is("deleted_at", null)
  .limit(1)
  .maybeSingle();
if (!org) throw new Error("No organization");

if (reminderIds.length) {
  const { data: updated, error: updErr } = await db
    .from("calendar")
    .update({ calendar_type: "reminder" })
    .eq("organization_id", org.id)
    .in("legacy_id", reminderIds)
    .is("deleted_at", null)
    .select("legacy_id, title, event_date, calendar_type");
  if (updErr) throw updErr;
  console.log("Updated rows:", updated?.length);
  for (const row of updated ?? []) {
    console.log(`  ${row.event_date} ${row.calendar_type} ${row.legacy_id} ${row.title}`);
  }
}

// Also fix any legacy_id prefixed with reminder- still typed as meeting
const { data: prefixed } = await db
  .from("calendar")
  .update({ calendar_type: "reminder" })
  .eq("organization_id", org.id)
  .eq("calendar_type", "meeting")
  .like("legacy_id", "reminder-%")
  .is("deleted_at", null)
  .select("legacy_id, title, event_date");
console.log("Prefix-fixed rows:", prefixed?.length ?? 0);
