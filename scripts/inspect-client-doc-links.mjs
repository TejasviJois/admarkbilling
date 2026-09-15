/**
 * Diagnose client-id resolution for archive documents vs blob.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { requireEgressAck } from './lib/egress-guard.mjs';
requireEgressAck("inspect-client-doc-links.mjs");

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
const normalize = (v) =>
  String(v ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const { data: org } = await db
  .from("organizations")
  .select("id")
  .is("deleted_at", null)
  .limit(1)
  .maybeSingle();

const { data: clients } = await db
  .from("clients")
  .select("id, legacy_id, company_name, deleted_at")
  .eq("organization_id", org.id);

console.log("Clients in relational:");
for (const c of clients ?? []) {
  console.log(
    `  ${c.deleted_at ? "DEL" : "OK "} legacy=${c.legacy_id} name=${c.company_name} id=${c.id}`,
  );
}

const { data: blobRow } = await sb
  .from("operations_data")
  .select("payload")
  .eq("id", "documents")
  .maybeSingle();
const archive = blobRow?.payload?.archiveDocuments ?? [];

const byLegacy = new Map((clients ?? []).filter((c) => !c.deleted_at).map((c) => [c.legacy_id, c]));
const byName = new Map();
for (const c of clients ?? []) {
  if (c.deleted_at) continue;
  const key = normalize(c.company_name);
  if (key && !byName.has(key)) byName.set(key, c);
}

console.log("\nBlob client-library docs resolution:");
for (const d of archive.filter((x) => x.library === "client")) {
  const byId = byLegacy.get(d.clientId);
  const byNm = byName.get(normalize(d.clientName || d.companyName));
  console.log({
    title: d.title,
    blobClientId: d.clientId,
    blobCompany: d.companyName || d.clientName,
    resolveByLegacy: byId ? byId.company_name : null,
    resolveByName: byNm ? `${byNm.legacy_id} (${byNm.company_name})` : null,
  });
}

const { data: live } = await db
  .from("documents")
  .select("legacy_id, title, document_type, client_id, company_id, notes")
  .eq("organization_id", org.id)
  .is("deleted_at", null)
  .like("document_type", "archive:client:%");

console.log("\nLive archive:client rows:");
for (const row of live ?? []) {
  const client = (clients ?? []).find((c) => c.id === row.client_id);
  console.log({
    title: row.title,
    client_id: row.client_id,
    company_id: row.company_id,
    resolved: client ? `${client.legacy_id} / ${client.company_name}` : null,
  });
}
