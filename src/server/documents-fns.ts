import { createServerFn } from "@tanstack/react-start";
import type { Agreement, ArchiveDocument, DocumentsData } from "@/lib/types";
import { requireServerSupabase } from "./supabase-admin";
import { assertAppSession } from "./app-session";
import { CACHE_KEYS, cacheDel, cacheThrough } from "./data-cache";
import { externalizeDocumentsData } from "./payload-files";
import { relationalDualWritesEnabled, relationalReadsEnabled } from "./env";
import { loadRelationalDocuments } from "./relational-read-repository";
import { saveRelationalDocuments } from "./relational-write-repository";

const DEFAULT_ORG_ID = "org-admark-digitals";

export const EMPTY_DOCUMENTS: DocumentsData = { agreements: [], archiveDocuments: [] };

type DocumentEntityKey = "agreements" | "archiveDocuments";
type DocumentEntity = Agreement | ArchiveDocument;

export type VersionedDocuments = { data: DocumentsData; version: string };
export type SaveDocumentsInput = {
  expectedVersion: string;
  upserts: Partial<Record<DocumentEntityKey, DocumentEntity[]>>;
  deletes: Partial<Record<DocumentEntityKey, string[]>>;
};
export type SaveDocumentsResult =
  | { ok: true; data: DocumentsData; version: string }
  | { ok: false; conflict: true; data: DocumentsData; version: string };

function parseAgreement(raw: unknown): Agreement | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Partial<Agreement>;
  if (
    typeof a.id !== "string" ||
    typeof a.title !== "string" ||
    typeof a.counterpartyName !== "string"
  ) {
    return null;
  }
  const now = Date.now();
  return {
    id: a.id,
    organizationId: DEFAULT_ORG_ID,
    title: a.title,
    counterpartyName: a.counterpartyName,
    counterpartyType: a.counterpartyType ?? "other",
    counterpartyRef: a.counterpartyRef,
    clientId: a.clientId,
    signedDate: a.signedDate,
    expiryDate: a.expiryDate,
    fileDataUrl: a.fileDataUrl,
    fileName: a.fileName,
    mimeType: a.mimeType,
    externalUrl: a.externalUrl,
    notes: a.notes,
    createdAt: typeof a.createdAt === "number" ? a.createdAt : now,
    updatedAt: typeof a.updatedAt === "number" ? a.updatedAt : now,
  };
}

function parseArchiveDocument(raw: unknown): ArchiveDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Partial<ArchiveDocument>;
  if (
    typeof d.id !== "string" ||
    typeof d.title !== "string" ||
    typeof d.clientId !== "string" ||
    typeof d.clientName !== "string"
  ) {
    return null;
  }
  const now = Date.now();
  return {
    id: d.id,
    organizationId: DEFAULT_ORG_ID,
    title: d.title,
    documentType:
      d.documentType === "agreement" || d.documentType === "proposal" ? d.documentType : "other",
    customType: d.customType,
    clientId: d.clientId,
    clientName: d.clientName,
    fileDataUrl: d.fileDataUrl,
    fileName: d.fileName,
    mimeType: d.mimeType,
    externalUrl: d.externalUrl,
    notes: d.notes,
    createdAt: typeof d.createdAt === "number" ? d.createdAt : now,
    updatedAt: typeof d.updatedAt === "number" ? d.updatedAt : now,
  };
}

function parseDocumentsPayload(payload: unknown): DocumentsData {
  if (!payload || typeof payload !== "object") return EMPTY_DOCUMENTS;
  const raw = payload as Partial<DocumentsData>;
  const agreements = Array.isArray(raw.agreements)
    ? raw.agreements.map(parseAgreement).filter((a): a is Agreement => a != null)
    : [];
  const archiveDocuments = Array.isArray(raw.archiveDocuments)
    ? raw.archiveDocuments.map(parseArchiveDocument).filter((d): d is ArchiveDocument => d != null)
    : [];
  return { agreements, archiveDocuments };
}

export const getDocumentsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<VersionedDocuments> => {
    await assertAppSession();
    const sb = requireServerSupabase();
    if (relationalReadsEnabled()) {
      const [{ data: versionRow, error }, documents] = await Promise.all([
        sb.from("operations_data").select("updated_at").eq("id", "documents").maybeSingle(),
        loadRelationalDocuments(),
      ]);
      if (error) throw error;
      if (!versionRow?.updated_at) throw new Error("Document version is missing.");
      return { data: documents, version: versionRow.updated_at };
    }
    const { data, error } = await sb
      .from("operations_data")
      .select("payload, updated_at")
      .eq("id", "documents")
      .maybeSingle();
    if (error) throw error;
    if (!data?.payload || !data.updated_at) {
      // First run — initialize the row so versioned saves have a CAS token.
      const { data: created, error: initError } = await sb
        .from("operations_data")
        .upsert({ id: "documents", payload: EMPTY_DOCUMENTS, updated_at: new Date().toISOString() })
        .select("payload, updated_at")
        .single();
      if (initError) throw initError;
      return { data: parseDocumentsPayload(created.payload), version: created.updated_at };
    }
    return { data: parseDocumentsPayload(data.payload), version: data.updated_at };
  },
);

export const saveDocumentsFn = createServerFn({ method: "POST" })
  .inputValidator((data: SaveDocumentsInput) => data)
  .handler(async ({ data }): Promise<SaveDocumentsResult> => {
    await assertAppSession();
    const sb = requireServerSupabase();
    const payload = await externalizeDocumentsData(sb, {
      agreements: (data.upserts.agreements ?? []) as Agreement[],
      archiveDocuments: (data.upserts.archiveDocuments ?? []) as ArchiveDocument[],
    });
    const prepared = {
      agreements: payload.agreements.map((a) => ({ ...a, organizationId: DEFAULT_ORG_ID })),
      archiveDocuments: payload.archiveDocuments.map((d) => ({
        ...d,
        organizationId: DEFAULT_ORG_ID,
      })),
    };

    let version = data.expectedVersion;
    let latest: DocumentsData | null = null;
    for (const key of ["agreements", "archiveDocuments"] as const) {
      const upserts = prepared[key];
      const deletes = data.deletes[key] ?? [];
      if (upserts.length === 0 && deletes.length === 0) continue;
      const { data: rows, error } = await sb.rpc("mutate_operations_aux_data", {
        p_row_id: "documents",
        p_expected_updated_at: version,
        p_entity_key: key,
        p_upserts: upserts,
        p_deletes: deletes,
      });
      if (error) throw error;
      const result = (
        rows as Array<{
          success: boolean;
          is_conflict: boolean;
          result_payload: unknown;
          result_updated_at: string;
        }> | null
      )?.[0];
      if (!result?.result_payload || !result.result_updated_at) {
        throw new Error("Safe document mutation returned no result.");
      }
      latest = parseDocumentsPayload(result.result_payload);
      version = result.result_updated_at;
      if (!result.success || result.is_conflict) {
        return { ok: false, conflict: true, data: latest, version };
      }
    }

    // No mutation ran (empty diff) — return the authoritative current row
    // instead of defaults so callers never cache an empty snapshot.
    if (latest === null) {
      const { data: row, error } = await sb
        .from("operations_data")
        .select("payload, updated_at")
        .eq("id", "documents")
        .maybeSingle();
      if (error) throw error;
      if (!row?.payload || !row.updated_at) throw new Error("Document data is missing.");
      return { ok: true, data: parseDocumentsPayload(row.payload), version: row.updated_at };
    }

    if (relationalReadsEnabled() || relationalDualWritesEnabled()) {
      await saveRelationalDocuments(latest);
    }
    cacheDel(CACHE_KEYS.documents);
    return { ok: true, data: latest, version };
  });
