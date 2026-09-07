import { createServerFn } from "@tanstack/react-start";
import {
  inferDocumentLibrary,
  isArchiveDocumentType,
  isDocumentLibrary,
  normalizeCompanyName,
} from "@/lib/document-vault";
import type { Agreement, ArchiveDocument, DocumentsData } from "@/lib/types";
import { requireServerSupabase } from "./supabase-admin";
import { assertAppSession } from "./app-session";
import { CACHE_KEYS, cacheDel, cacheThrough } from "./data-cache";
import { externalizeDocumentsData } from "./payload-files";
import { relationalDualWritesEnabled, relationalReadsEnabled } from "./env";
import { loadRelationalDocuments } from "./relational-read-repository";
import { saveRelationalDocuments } from "./relational-write-repository";
import { bumpLegacyVersionToken, readLegacyVersionToken } from "./legacy-version-token";

const DEFAULT_ORG_ID = "org-admark-digitals";

export const EMPTY_DOCUMENTS: DocumentsData = { agreements: [], archiveDocuments: [] };

type DocumentEntityKey = "agreements" | "archiveDocuments";
type DocumentEntity = Agreement | ArchiveDocument;

export type VersionedDocuments = { data: DocumentsData; version: string };
export type SaveDocumentsInput = {
  expectedVersion: string;
  upserts: Partial<Record<DocumentEntityKey, DocumentEntity[]>>;
  deletes: Partial<Record<DocumentEntityKey, string[]>>;
  allowedDeleteIds?: Partial<Record<DocumentEntityKey, string[]>>;
  allowAllDeletes?: boolean;
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
  if (typeof d.id !== "string" || typeof d.title !== "string") return null;
  const documentType = isArchiveDocumentType(d.documentType) ? d.documentType : "other";
  const clientId = typeof d.clientId === "string" && d.clientId ? d.clientId : undefined;
  const library = isDocumentLibrary(d.library)
    ? d.library
    : inferDocumentLibrary({ library: d.library, clientId, documentType });
  const companyName =
    normalizeCompanyName(d.companyName || d.clientName) || (library === "vault" ? "Admark" : "");
  if (!companyName) return null;
  const now = Date.now();
  const assignedMemberIds = Array.isArray(d.assignedMemberIds)
    ? d.assignedMemberIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : undefined;
  return {
    id: d.id,
    organizationId: DEFAULT_ORG_ID,
    title: d.title,
    documentType,
    customType: d.customType,
    library,
    companyName,
    clientId,
    clientName: typeof d.clientName === "string" && d.clientName ? d.clientName : companyName,
    projectId: typeof d.projectId === "string" && d.projectId ? d.projectId : undefined,
    assignedMemberIds:
      assignedMemberIds && assignedMemberIds.length > 0 ? assignedMemberIds : undefined,
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

function mergeDocumentEntities<T extends { id: string }>(
  current: T[],
  upserts: T[],
  deletes: string[],
): T[] {
  if (upserts.length === 0 && deletes.length === 0) return current;
  const remove = new Set(deletes);
  const byId = new Map(current.filter((item) => !remove.has(item.id)).map((item) => [item.id, item]));
  for (const item of upserts) byId.set(item.id, item);
  return [...byId.values()];
}

function applyDocumentsMutation(current: DocumentsData, input: SaveDocumentsInput): DocumentsData {
  return {
    agreements: mergeDocumentEntities(
      current.agreements,
      (input.upserts.agreements ?? []) as Agreement[],
      input.deletes.agreements ?? [],
    ),
    archiveDocuments: mergeDocumentEntities(
      current.archiveDocuments,
      (input.upserts.archiveDocuments ?? []) as ArchiveDocument[],
      input.deletes.archiveDocuments ?? [],
    ),
  };
}

function documentsMutationEmpty(input: SaveDocumentsInput): boolean {
  for (const key of ["agreements", "archiveDocuments"] as const) {
    if ((input.deletes[key] ?? []).length > 0) return false;
    if ((input.upserts[key] ?? []).length > 0) return false;
  }
  return true;
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
    if (!data.allowAllDeletes) {
      for (const key of ["agreements", "archiveDocuments"] as const) {
        const ids = data.deletes[key] ?? [];
        if (ids.length === 0) continue;
        const allowed = new Set(data.allowedDeleteIds?.[key] ?? []);
        const unauthorized = ids.filter((id) => !allowed.has(id));
        if (unauthorized.length > 0) {
          throw new Error(
            `Refused unauthorized ${key} delete(s). Explicit delete intent is required.`,
          );
        }
      }
    }
    const sb = requireServerSupabase();

    if (relationalReadsEnabled()) {
      const version = await readLegacyVersionToken("documents");
      if (version !== data.expectedVersion) {
        const latest = await loadRelationalDocuments();
        return { ok: false, conflict: true, data: latest, version };
      }
      if (documentsMutationEmpty(data)) {
        return { ok: true, data: await loadRelationalDocuments(), version };
      }

      const current = await loadRelationalDocuments();
      const latest = applyDocumentsMutation(current, data);
      await saveRelationalDocuments(latest);

      const bumped = await bumpLegacyVersionToken("documents", data.expectedVersion);
      if (!bumped.ok) {
        const reloaded = await loadRelationalDocuments();
        return { ok: false, conflict: true, data: reloaded, version: bumped.version };
      }

      cacheDel(CACHE_KEYS.documents);
      return { ok: true, data: latest, version: bumped.version };
    }

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
