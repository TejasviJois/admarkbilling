import { createServerFn } from "@tanstack/react-start";
import type { Agreement, ArchiveDocument, DocumentsData } from "@/lib/types";
import { requireServerSupabase } from "./supabase-admin";
import { assertAppSession } from "./app-session";
import { CACHE_KEYS, cacheSet, cacheThrough } from "./data-cache";
import { assertRelationalMode } from "./env";
import { loadRelationalDocuments } from "./relational-read-repository";
import { saveRelationalDocuments } from "./relational-write-repository";
import { bumpLegacyVersionToken, readLegacyVersionToken } from "./legacy-version-token";

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
    assertRelationalMode();
    const sb = requireServerSupabase();
    const [{ data: versionRow, error }, documents] = await Promise.all([
      sb.from("operations_data").select("updated_at").eq("id", "documents").maybeSingle(),
      cacheThrough(CACHE_KEYS.documents, loadRelationalDocuments),
    ]);
    if (error) throw error;
    if (!versionRow?.updated_at) throw new Error("Document version is missing.");
    return { data: documents, version: versionRow.updated_at };
  },
);

export const saveDocumentsFn = createServerFn({ method: "POST" })
  .inputValidator((data: SaveDocumentsInput) => data)
  .handler(async ({ data }): Promise<SaveDocumentsResult> => {
    await assertAppSession();
    assertRelationalMode();
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

    const version = await readLegacyVersionToken("documents");
    if (version !== data.expectedVersion) {
      const latest = await loadRelationalDocuments();
      cacheSet(CACHE_KEYS.documents, latest);
      return { ok: false, conflict: true, data: latest, version };
    }
    if (documentsMutationEmpty(data)) {
      const cached = await cacheThrough(CACHE_KEYS.documents, loadRelationalDocuments);
      return { ok: true, data: cached, version };
    }

    const current = await loadRelationalDocuments();
    const latest = applyDocumentsMutation(current, data);
    await saveRelationalDocuments(latest);

    const bumped = await bumpLegacyVersionToken("documents", data.expectedVersion);
    if (!bumped.ok) {
      const reloaded = await loadRelationalDocuments();
      cacheSet(CACHE_KEYS.documents, reloaded);
      return { ok: false, conflict: true, data: reloaded, version: bumped.version };
    }

    cacheSet(CACHE_KEYS.documents, latest);
    return { ok: true, data: latest, version: bumped.version };
  });
