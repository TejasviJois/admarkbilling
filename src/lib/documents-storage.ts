import type { Agreement, ArchiveDocument, DocumentsData } from "@/lib/types";
import { logClientError } from "./client-logger";
import { getDocumentsFn, saveDocumentsFn, EMPTY_DOCUMENTS } from "@/server/documents-fns";
import { getDataBackendStatus } from "@/server/invoice-fns";

const DOCUMENTS_KEY = "admark.documents";
type DocumentKey = "agreements" | "archiveDocuments";
type DocumentEntity = Agreement | ArchiveDocument;

export type DocumentsPersistOptions = {
  deleteIds?: Partial<Record<DocumentKey, string[]>>;
  allowAllDeletes?: boolean;
};

export type DocumentsMutation = {
  upserts: Partial<Record<DocumentKey, DocumentEntity[]>>;
  deletes: Partial<Record<DocumentKey, string[]>>;
};

export class DocumentsConflictError extends Error {
  constructor(
    public readonly latest: DocumentsData,
    public readonly version: string,
    public readonly next: DocumentsData,
    public readonly options: DocumentsPersistOptions,
    public readonly mutation: DocumentsMutation,
  ) {
    super("Documents changed in another browser.");
    this.name = "DocumentsConflictError";
  }
}

/** Replay an attempted entity mutation on top of the latest server documents. */
export function applyDocumentsMutation(
  latest: DocumentsData,
  mutation: DocumentsMutation,
): DocumentsData {
  const next = { ...latest };
  for (const key of ["agreements", "archiveDocuments"] as const) {
    const upserts = mutation.upserts[key] ?? [];
    const deletes = new Set(mutation.deletes[key] ?? []);
    if (upserts.length === 0 && deletes.size === 0) continue;
    const byId = new Map(latest[key].map((item) => [item.id, item]));
    for (const id of deletes) byId.delete(id);
    for (const item of upserts) byId.set(item.id, item);
    (next as Record<DocumentKey, DocumentEntity[]>)[key] = [...byId.values()];
  }
  return next as DocumentsData;
}

let documentsVersion: string | null = null;
let documentsSnapshot: DocumentsData | null = null;

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function loadDocumentsLocal(): DocumentsData {
  if (!isBrowser()) return EMPTY_DOCUMENTS;
  try {
    const raw = localStorage.getItem(DOCUMENTS_KEY);
    return raw ? (JSON.parse(raw) as DocumentsData) : EMPTY_DOCUMENTS;
  } catch {
    return EMPTY_DOCUMENTS;
  }
}

function saveDocumentsLocal(data: DocumentsData) {
  if (!isBrowser()) return;
  localStorage.setItem(DOCUMENTS_KEY, JSON.stringify(data));
}

export async function loadDocuments(): Promise<DocumentsData> {
  if (!isBrowser()) return EMPTY_DOCUMENTS;
  try {
    const backend = await getDataBackendStatus();
    if (backend.configured) {
      const remote = await getDocumentsFn();
      documentsVersion = remote.version;
      documentsSnapshot = remote.data;
      saveDocumentsLocal(remote.data);
      return remote.data;
    }
  } catch (e) {
    logClientError("documents.load.remote", e);
  }
  return loadDocumentsLocal();
}

export async function saveDocuments(
  data: DocumentsData,
  options: DocumentsPersistOptions = {},
  conflictVersion?: string,
): Promise<DocumentsData> {
  saveDocumentsLocal(data);
  try {
    const backend = await getDataBackendStatus();
    if (backend.configured) {
      const before = documentsSnapshot ?? (await loadDocuments());
      const upserts: Partial<Record<DocumentKey, DocumentEntity[]>> = {};
      const deletes: Partial<Record<DocumentKey, string[]>> = {};
      for (const key of ["agreements", "archiveDocuments"] as const) {
        const previous = new Map(before[key].map((item) => [item.id, item]));
        const next = new Map(data[key].map((item) => [item.id, item]));
        const changed = [...next.values()].filter(
          (item) => JSON.stringify(previous.get(item.id)) !== JSON.stringify(item),
        );
        if (changed.length > 0) upserts[key] = changed as DocumentEntity[];
        const removed = [...previous.keys()].filter((id) => !next.has(id));
        const allowed = new Set(options.deleteIds?.[key] ?? []);
        const unauthorized = options.allowAllDeletes
          ? []
          : removed.filter((id) => !allowed.has(id));
        if (unauthorized.length > 0) {
          throw new Error(`Unsafe ${key} deletion blocked. Reload current documents.`);
        }
        if (removed.length > 0) deletes[key] = removed;
      }
      // Nothing actually changed — don't hit the server (a no-op save must
      // never replace populated state with defaults).
      if (Object.keys(upserts).length === 0 && Object.keys(deletes).length === 0) {
        documentsSnapshot = data;
        return data;
      }
      const expectedVersion = conflictVersion ?? documentsVersion;
      if (!expectedVersion) throw new Error("Document version is not loaded.");
      const result = await saveDocumentsFn({
        data: { expectedVersion, upserts, deletes },
      });
      documentsVersion = result.version;
      documentsSnapshot = result.data;
      saveDocumentsLocal(result.data);
      if (!result.ok) {
        throw new DocumentsConflictError(result.data, result.version, data, options, {
          upserts,
          deletes,
        });
      }
      return result.data;
    }
    documentsSnapshot = data;
    return data;
  } catch (e) {
    logClientError("documents.save.remote", e);
    throw e instanceof Error ? e : new Error("Could not save documents to server.");
  }
}
