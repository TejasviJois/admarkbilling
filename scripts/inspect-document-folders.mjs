/**
 * Simulate what Documents UI sees after relational load.
 * Usage: node scripts/inspect-document-folders.mjs
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { requireEgressAck } from './lib/egress-guard.mjs';
requireEgressAck("inspect-document-folders.mjs");

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

const isLibrary = (v) =>
  v === "preclient" || v === "proposals" || v === "quotations" || v === "client" || v === "vault";
const isPreClient = (v) => v === "preclient" || v === "proposals" || v === "quotations";
const PREFIX = "admark-archive-v1:";

function decodeNotes(notes) {
  const raw = (notes ?? "").trim();
  if (!raw.startsWith(PREFIX)) return { meta: {}, notes: raw || undefined };
  const rest = raw.slice(PREFIX.length);
  const nl = rest.indexOf("\n");
  const jsonPart = nl === -1 ? rest : rest.slice(0, nl);
  try {
    return { meta: JSON.parse(jsonPart), notes: nl === -1 ? undefined : rest.slice(nl + 1).trim() || undefined };
  } catch {
    return { meta: {}, notes: raw };
  }
}

function parseType(documentType) {
  if (!documentType.startsWith("archive:")) return { typeLabel: "other" };
  const rest = documentType.slice("archive:".length);
  const colon = rest.indexOf(":");
  if (colon > 0) {
    const maybe = rest.slice(0, colon);
    if (isLibrary(maybe)) return { library: maybe, typeLabel: rest.slice(colon + 1) || "other" };
  }
  return { typeLabel: rest || "other" };
}

const { data: org } = await db
  .from("organizations")
  .select("id")
  .is("deleted_at", null)
  .limit(1)
  .maybeSingle();

const { data: clients } = await db
  .from("clients")
  .select("id, legacy_id, company_name")
  .eq("organization_id", org.id)
  .is("deleted_at", null);

const clientLegacyById = new Map((clients ?? []).map((c) => [c.id, c.legacy_id ?? c.id]));
const clientNameById = new Map((clients ?? []).map((c) => [c.id, c.company_name]));

const { data: rows } = await db
  .from("documents")
  .select(
    "legacy_id, title, document_type, notes, client_id, company_id, file_url, external_url, deleted_at",
  )
  .eq("organization_id", org.id)
  .is("deleted_at", null)
  .like("document_type", "archive:%");

const docs = [];
for (const row of rows ?? []) {
  const { library: encodedLibrary, typeLabel } = parseType(row.document_type);
  const { meta } = decodeNotes(row.notes);
  const clientId = row.client_id ? clientLegacyById.get(row.client_id) ?? row.client_id : undefined;
  const linkedClientName = row.client_id ? clientNameById.get(row.client_id) : undefined;
  const companyName =
    meta.companyName || linkedClientName || (clientId ? "Unknown company" : "Admark");
  let library = meta.library ?? encodedLibrary;
  if (!isLibrary(library)) {
    if (clientId) library = "client";
    else if (typeLabel === "proposal") library = "proposals";
    else if (typeLabel === "quotation") library = "quotations";
    else library = "client";
  }
  docs.push({
    id: String(row.legacy_id ?? "").replace(/^archive-document-/, ""),
    title: row.title,
    library,
    companyName,
    clientId,
    hasFile: Boolean(row.file_url || row.external_url),
    owner: row.client_id ? "client" : row.company_id ? "company" : "none",
    metaRaw: meta,
    type: row.document_type,
  });
}

const byLib = {};
for (const d of docs) byLib[d.library] = (byLib[d.library] || 0) + 1;
console.log("Loaded archive docs:", docs.length, byLib);

const pre = docs.filter((d) => isPreClient(d.library));
const groups = new Map();
for (const d of pre) {
  const name = (d.companyName ?? "").trim();
  if (!name) {
    console.log("SKIP empty company:", d.id, d.title, d);
    continue;
  }
  groups.set(name, (groups.get(name) || 0) + 1);
}
console.log("\nProposal/preclient company folders (", groups.size, "):");
for (const [name, count] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(`  ${count}  ${name}`);
}

console.log("\nClient-library docs:");
for (const d of docs.filter((d) => d.library === "client")) {
  console.log(`  ${d.clientId || "(no clientId)"} | ${d.companyName} | ${d.title}`);
}

console.log("\nVault:");
for (const d of docs.filter((d) => d.library === "vault")) {
  console.log(`  ${d.companyName} | ${d.title} | file=${d.hasFile}`);
}

// Compare blob company folders
const { data: blobRow } = await sb
  .from("operations_data")
  .select("payload")
  .eq("id", "documents")
  .maybeSingle();
const blob = Array.isArray(blobRow?.payload?.archiveDocuments)
  ? blobRow.payload.archiveDocuments
  : [];
const blobPre = blob.filter((d) => isPreClient(d.library || (d.documentType === "proposal" ? "proposals" : "")));
const blobGroups = new Map();
for (const d of blobPre) {
  const name = (d.companyName || d.clientName || "").trim();
  if (!name) continue;
  blobGroups.set(name, (blobGroups.get(name) || 0) + 1);
}
console.log("\nBlob proposal/preclient folders (", blobGroups.size, "):");
for (const [name, count] of [...blobGroups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const live = groups.get(name) || 0;
  console.log(`  blob=${count} live=${live}${live !== count ? "  MISMATCH" : ""}  ${name}`);
}
const missing = [...blobGroups.keys()].filter((k) => !groups.has(k));
const extra = [...groups.keys()].filter((k) => !blobGroups.has(k));
console.log("\nMissing from live:", missing);
console.log("Extra on live:", extra);

const blobIds = new Set(blob.map((d) => d.id));
const liveIds = new Set(docs.map((d) => d.id));
console.log(
  "\nBlob ids missing in live:",
  [...blobIds].filter((id) => !liveIds.has(id)),
);
console.log(
  "Live ids not in blob:",
  [...liveIds].filter((id) => !blobIds.has(id)),
);
