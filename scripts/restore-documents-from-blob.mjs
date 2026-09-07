/**
 * Restore archive documents (+ agreements) from operations_data/documents into admark.*.
 *
 * Usage: node scripts/restore-documents-from-blob.mjs
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

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing Supabase credentials");

const sb = createClient(url, key, {
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
  .select("payload, updated_at")
  .eq("id", "documents")
  .maybeSingle();
if (blobError) throw blobError;
const payload = docsRow?.payload ?? {};
const agreements = Array.isArray(payload.agreements) ? payload.agreements : [];
const archiveDocuments = Array.isArray(payload.archiveDocuments) ? payload.archiveDocuments : [];
console.log(
  `Blob: ${agreements.length} agreements, ${archiveDocuments.length} archive (updated_at=${docsRow?.updated_at})`,
);

const { data: org, error: orgError } = await db
  .from("organizations")
  .select("id, legacy_id")
  .is("deleted_at", null)
  .limit(1)
  .maybeSingle();
if (orgError) throw orgError;
if (!org) throw new Error("No organization");

const [{ data: clientRows }, { data: companyRow }, { data: existingDocs }, { data: existingAgreements }] =
  await Promise.all([
    db
      .from("clients")
      .select("id, legacy_id, company_name, deleted_at")
      .eq("organization_id", org.id),
    db.from("companies").select("id").eq("organization_id", org.id).maybeSingle(),
    db
      .from("documents")
      .select("id, legacy_id, document_type, deleted_at")
      .eq("organization_id", org.id),
    db.from("agreements").select("id, legacy_id, deleted_at").eq("organization_id", org.id),
  ]);

const companyId = companyRow?.id ?? stableUuid("company", org.legacy_id ?? "org-admark-digitals");
const clientByLegacy = new Map();
const clientByName = new Map();
for (const row of clientRows ?? []) {
  if (row.legacy_id) clientByLegacy.set(row.legacy_id, row.id);
  const key = normalize(row.company_name);
  if (key && !row.deleted_at && !clientByName.has(key)) clientByName.set(key, row.id);
}

const agreementByLegacy = new Map(
  (existingAgreements ?? []).filter((r) => r.legacy_id).map((r) => [r.legacy_id, r.id]),
);
const agreementDocByLegacy = new Map(
  (existingDocs ?? [])
    .filter((r) => r.legacy_id && r.document_type === "agreement")
    .map((r) => [r.legacy_id, r.id]),
);
const archiveDocByLegacy = new Map(
  (existingDocs ?? [])
    .filter((r) => r.legacy_id && String(r.document_type).startsWith("archive:"))
    .map((r) => [r.legacy_id, r.id]),
);

const agreementRows = [];
const documentRows = [];
let skippedArchive = 0;

for (const agreement of agreements) {
  const legacyId = text(agreement.id);
  if (!legacyId) continue;
  const id = resolveId("agreement", legacyId, agreementByLegacy);
  const clientRowId =
    clientByLegacy.get(agreement.clientId) ??
    clientByLegacy.get(agreement.counterpartyRef) ??
    clientByName.get(normalize(agreement.counterpartyName)) ??
    null;
  agreementRows.push({
    id,
    organization_id: org.id,
    legacy_id: legacyId,
    client_id: clientRowId,
    title: text(agreement.title) ?? "Untitled agreement",
    legacy_counterparty_name: text(agreement.counterpartyName),
    agreement_type: text(agreement.counterpartyType) ?? "agreement",
    status: agreement.signedDate ? "signed" : "draft",
    signed_date: text(agreement.signedDate)?.slice(0, 10) ?? null,
    expiry_date: text(agreement.expiryDate)?.slice(0, 10) ?? null,
    notes: text(agreement.notes),
    migration_review_required: !clientRowId,
    created_at:
      typeof agreement.createdAt === "number"
        ? new Date(agreement.createdAt).toISOString()
        : new Date().toISOString(),
    deleted_at: null,
  });
  const fileUrl = text(agreement.fileDataUrl) ?? text(agreement.fileUrl);
  const externalUrl = text(agreement.externalUrl);
  if (!fileUrl && !externalUrl) continue;
  const docLegacy = `agreement-document-${legacyId}`;
  documentRows.push({
    id: resolveId("document", docLegacy, agreementDocByLegacy),
    organization_id: org.id,
    legacy_id: docLegacy,
    company_id: null,
    client_id: null,
    project_id: null,
    agreement_id: id,
    invoice_id: null,
    transaction_id: null,
    partnership_id: null,
    title: text(agreement.title) ?? "Agreement",
    document_type: "agreement",
    file_url: fileUrl,
    external_url: externalUrl,
    file_name: text(agreement.fileName),
    mime_type: text(agreement.mimeType),
    notes: text(agreement.notes),
    deleted_at: null,
  });
}

for (const document of archiveDocuments) {
  const legacyId = text(document.id);
  if (!legacyId) continue;
  const library = inferLibrary(document);
  const fileUrl = text(document.fileDataUrl) ?? text(document.fileUrl);
  const externalUrl = text(document.externalUrl);
  if (!fileUrl && !externalUrl) {
    skippedArchive += 1;
    console.warn(`Skip ${legacyId} (${document.title}) — no file_url/external_url`);
    continue;
  }
  const clientRowId =
    clientByLegacy.get(document.clientId) ??
    clientByName.get(normalize(document.clientName || document.companyName)) ??
    null;
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

if (agreementRows.length) {
  const { error } = await db.from("agreements").upsert(agreementRows, {
    onConflict: "organization_id,legacy_id",
  });
  if (error) throw error;
}
if (documentRows.length) {
  for (let i = 0; i < documentRows.length; i += 50) {
    const batch = documentRows.slice(i, i + 50);
    const { error } = await db.from("documents").upsert(batch, {
      onConflict: "organization_id,legacy_id",
    });
    if (error) throw error;
  }
}

const { data: liveArchive } = await db
  .from("documents")
  .select("document_type, client_id, company_id, title")
  .eq("organization_id", org.id)
  .is("deleted_at", null)
  .like("document_type", "archive:%");

const byLib = {};
for (const row of liveArchive ?? []) {
  const parts = String(row.document_type).split(":");
  const lib = parts[1] || "?";
  byLib[lib] = (byLib[lib] || 0) + 1;
}

console.log(`Upserted ${agreementRows.length} agreements, ${documentRows.length} documents`);
console.log(`Live archive docs: ${(liveArchive ?? []).length}`, byLib);
if (skippedArchive) console.warn(`Skipped ${skippedArchive} archive doc(s) without files`);
console.log("Done.");
