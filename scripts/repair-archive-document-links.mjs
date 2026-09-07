/**
 * Re-apply blob archive docs with correct ownership:
 * - proposals/preclient/quotations/vault → company_id only
 * - client library → resolve client via legacy id, aliases, or fuzzy name
 *
 * Usage: node scripts/repair-archive-document-links.mjs
 */
import { createHash } from "node:crypto";
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

const CLIENT_ID_ALIASES = {
  "cli-srivatsanka-catering-events-services": "cli-kannan-sirangapalli",
  "cli-avighna-consultancy-services": "cli-avighna",
};

const CLIENT_NAME_ALIASES = {
  srivatsankacateringeventsservices: "cli-kannan-sirangapalli",
  srivatsankaevents: "cli-kannan-sirangapalli",
  avighnaconsultancyservices: "cli-avighna",
  avighnaspecialityingredientspvtltd: "cli-avighna",
};

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});
const db = sb.schema("admark");

function stableUuid(scope, legacyId) {
  const bytes = createHash("sha256").update(`${scope}:${legacyId}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const text = (value) => (typeof value === "string" && value.trim() ? value.trim() : null);
const normalize = (value) => (text(value) ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const isUuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value ?? "");
const isLibrary = (value) =>
  value === "preclient" ||
  value === "proposals" ||
  value === "quotations" ||
  value === "client" ||
  value === "vault";
const isPreClient = (library) =>
  library === "preclient" || library === "proposals" || library === "quotations";

function inferLibrary(doc) {
  if (isLibrary(doc.library)) return doc.library;
  if (doc.clientId) return "client";
  if (doc.documentType === "proposal") return "proposals";
  if (doc.documentType === "quotation") return "quotations";
  return "client";
}

function encodeType(library, documentType, customType) {
  const typeLabel =
    documentType === "other"
      ? customType
          ?.trim()
          .toLowerCase()
          .replace(/[^a-z0-9_-]+/g, "-")
          .replace(/^-+|-+$/g, "") || "other"
      : documentType || "other";
  return `archive:${library}:${typeLabel}`;
}

function encodeNotes(doc, library) {
  const companyName = text(doc.companyName || doc.clientName) || undefined;
  const meta = {
    library,
    companyName,
    customType: doc.documentType === "other" ? doc.customType : undefined,
    assignedMemberIds: Array.isArray(doc.assignedMemberIds) ? doc.assignedMemberIds : undefined,
    projectId: doc.projectId,
  };
  const body = text(doc.notes) ?? "";
  return `admark-archive-v1:${JSON.stringify(meta)}${body ? `\n${body}` : ""}`;
}

function resolveId(scope, legacyId, existingByLegacy) {
  const stored = existingByLegacy.get(legacyId);
  if (stored) return stored;
  return isUuid(legacyId) ? legacyId : stableUuid(scope, legacyId);
}

const { data: docsRow, error: blobError } = await sb
  .from("operations_data")
  .select("payload")
  .eq("id", "documents")
  .maybeSingle();
if (blobError) throw blobError;
const archiveDocuments = Array.isArray(docsRow?.payload?.archiveDocuments)
  ? docsRow.payload.archiveDocuments
  : [];

const { data: org } = await db
  .from("organizations")
  .select("id, legacy_id")
  .is("deleted_at", null)
  .limit(1)
  .maybeSingle();
if (!org) throw new Error("No organization");

const [{ data: clientRows }, { data: companyRow }, { data: existingDocs }] = await Promise.all([
  db
    .from("clients")
    .select("id, legacy_id, company_name, deleted_at")
    .eq("organization_id", org.id),
  db.from("companies").select("id").eq("organization_id", org.id).maybeSingle(),
  db
    .from("documents")
    .select("id, legacy_id, document_type")
    .eq("organization_id", org.id)
    .like("document_type", "archive:%"),
]);

const companyId = companyRow?.id ?? stableUuid("company", org.legacy_id ?? "org-admark-digitals");
const clientByLegacy = new Map();
const clientByName = new Map();
for (const row of clientRows ?? []) {
  if (row.deleted_at) continue;
  if (row.legacy_id) clientByLegacy.set(row.legacy_id, row.id);
  const key = normalize(row.company_name);
  if (key && !clientByName.has(key)) clientByName.set(key, row.id);
}

function resolveClientRowId(doc) {
  const rawId = text(doc.clientId);
  const aliased = rawId ? CLIENT_ID_ALIASES[rawId] || rawId : null;
  if (aliased && clientByLegacy.has(aliased)) return clientByLegacy.get(aliased);

  const nameKey = normalize(doc.clientName || doc.companyName);
  if (nameKey && CLIENT_NAME_ALIASES[nameKey] && clientByLegacy.has(CLIENT_NAME_ALIASES[nameKey])) {
    return clientByLegacy.get(CLIENT_NAME_ALIASES[nameKey]);
  }
  if (nameKey && clientByName.has(nameKey)) return clientByName.get(nameKey);

  // Loose contains match on significant tokens (min length 5) for renamed CRM rows.
  if (nameKey && nameKey.length >= 5) {
    for (const [key, id] of clientByName.entries()) {
      if (key.includes(nameKey) || nameKey.includes(key)) {
        if (Math.min(key.length, nameKey.length) >= 5) return id;
      }
      // shared stem: first 8+ chars
      const stem = nameKey.slice(0, 8);
      if (stem.length >= 6 && key.startsWith(stem)) return id;
    }
  }
  return null;
}

const archiveDocByLegacy = new Map(
  (existingDocs ?? []).filter((r) => r.legacy_id).map((r) => [r.legacy_id, r.id]),
);

const documentRows = [];
let skipped = 0;
const summary = { clientLinked: 0, companyOwned: 0, byLib: {} };

for (const document of archiveDocuments) {
  const legacyId = text(document.id);
  if (!legacyId) continue;
  const library = inferLibrary(document);
  const fileUrl = text(document.fileDataUrl) ?? text(document.fileUrl);
  const externalUrl = text(document.externalUrl);
  if (!fileUrl && !externalUrl) {
    skipped += 1;
    console.warn(`Skip ${legacyId} — no file`);
    continue;
  }

  // Only client-library docs own via client_id. Proposals/preclient/vault stay
  // company-owned so they cannot disappear into CRM client folders.
  let clientRowId = null;
  if (library === "client") {
    clientRowId = resolveClientRowId(document);
    if (!clientRowId) {
      console.warn(
        `Client doc without CRM match → company-owned until remapped: ${document.title} (${document.clientId || document.companyName})`,
      );
    } else {
      summary.clientLinked += 1;
    }
  }

  if (clientRowId) {
    // ok
  } else {
    summary.companyOwned += 1;
  }
  summary.byLib[library] = (summary.byLib[library] || 0) + 1;

  const docLegacy = `archive-document-${legacyId}`;
  documentRows.push({
    id: resolveId("archive-document", docLegacy, archiveDocByLegacy),
    organization_id: org.id,
    legacy_id: docLegacy,
    company_id: clientRowId ? null : companyId,
    client_id: clientRowId,
    project_id: null,
    agreement_id: null,
    invoice_id: null,
    transaction_id: null,
    partnership_id: null,
    title: text(document.title) ?? "Untitled document",
    document_type: encodeType(library, document.documentType, document.customType),
    file_url: fileUrl,
    external_url: externalUrl,
    file_name: text(document.fileName),
    mime_type: text(document.mimeType),
    notes: encodeNotes(document, library),
    deleted_at: null,
  });
}

for (let i = 0; i < documentRows.length; i += 50) {
  const batch = documentRows.slice(i, i + 50);
  const { error } = await db.from("documents").upsert(batch, {
    onConflict: "organization_id,legacy_id",
  });
  if (error) throw error;
}

console.log(`Upserted ${documentRows.length} archive docs (skipped ${skipped})`);
console.log(summary);

// Verify folder visibility rules
const { data: live } = await db
  .from("documents")
  .select("document_type, client_id, company_id, notes, title")
  .eq("organization_id", org.id)
  .is("deleted_at", null)
  .like("document_type", "archive:%");

const folders = { proposals: new Set(), client: new Set() };
for (const row of live ?? []) {
  const lib = String(row.document_type).split(":")[1];
  let meta = {};
  try {
    meta = JSON.parse(String(row.notes ?? "").slice("admark-archive-v1:".length).split("\n")[0]);
  } catch {
    /* ignore */
  }
  const company = meta.companyName || row.title;
  if (isPreClient(lib)) folders.proposals.add(company);
  if (lib === "client" && row.client_id) {
    const client = (clientRows ?? []).find((c) => c.id === row.client_id);
    folders.client.add(client?.company_name || company);
  }
  if (lib === "client" && !row.client_id) {
    console.warn("Still orphan client-library doc:", row.title, company);
  }
}

console.log("Proposal/preclient folders:", [...folders.proposals].sort());
console.log("Client folders:", [...folders.client].sort());
