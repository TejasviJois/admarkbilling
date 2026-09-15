import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { requireEgressAck } from './lib/egress-guard.mjs';
requireEgressAck("inspect-archive-meta.mjs");

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
  .from("documents")
  .select("title, document_type, notes, client_id, company_id, file_url")
  .eq("organization_id", org.id)
  .is("deleted_at", null)
  .like("document_type", "archive:%");

for (const row of rows ?? []) {
  const notes = row.notes ?? "";
  const ok = notes.startsWith("admark-archive-v1:");
  let meta = null;
  try {
    meta = JSON.parse(notes.slice("admark-archive-v1:".length).split("\n")[0]);
  } catch (e) {
    meta = { error: String(e) };
  }
  if (
    row.document_type.startsWith("archive:proposals") ||
    row.document_type.startsWith("archive:preclient") ||
    !row.client_id
  ) {
    console.log({
      title: row.title,
      type: row.document_type,
      metaOk: ok,
      meta,
      hasFile: Boolean(row.file_url),
      client_id: row.client_id,
    });
  }
}
