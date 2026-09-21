import type { Agreement, ArchiveDocument, DocumentsData } from "@/lib/types";
import { logClientError } from "./client-logger";
import { getDocumentsFn, saveDocumentsFn, EMPTY_DOCUMENTS } from "@/server/documents-fns";
import { isServerApiConfigured } from "@/lib/backend-status-cache";
import { safeLocalStorageSet } from "./browser-storage";
import {
  countDocumentsRecords,
  stabilizeDocumentsFileRefs,
} from "./stabilize-file-refs";

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
let writeQueue: Promise<unknown> = Promise.resolve();
let blockedConflict: DocumentsConflictError | null = null;
let pendingWrites = 0;

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function normalizeDocuments(data: DocumentsData | null | undefined): DocumentsData {
  return {
    agreements: Array.isArray(data?.agreements) ? data.agreements : [],
    archiveDocuments: Array.isArray(data?.archiveDocuments) ? data.archiveDocuments : [],
  };
}

function loadDocumentsLocal(): DocumentsData {
  if (!isBrowser()) return EMPTY_DOCUMENTS;
  try {
    const raw = localStorage.getItem(DOCUMENTS_KEY);
    return raw ? normalizeDocuments(JSON.parse(raw) as DocumentsData) : EMPTY_DOCUMENTS;
  } catch {
    return EMPTY_DOCUMENTS;
  }
}

function saveDocumentsLocal(data: DocumentsData) {
  if (!isBrowser()) return;
  safeLocalStorageSet(DOCUMENTS_KEY, JSON.stringify(stabilizeDocumentsFileRefs(data)));
}

function readDocumentsLocalRaw(): DocumentsData | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(DOCUMENTS_KEY);
    if (!raw) return null;
    return normalizeDocuments(JSON.parse(raw) as DocumentsData);
  } catch {
    return null;
  }
}

export async function loadDocuments(): Promise<DocumentsData> {
  if (!isBrowser()) return EMPTY_DOCUMENTS;
  try {
    if (await isServerApiConfigured()) {
      const remote = await getDocumentsFn();
      if (pendingWrites === 0) {
        documentsVersion = remote.version;
        const normalized = stabilizeDocumentsFileRefs(normalizeDocuments(remote.data));
        const localRaw = readDocumentsLocalRaw();
        if (
          localRaw &&
          countDocumentsRecords(normalized) === 0 &&
          countDocumentsRecords(localRaw) > 0
        ) {
          logClientError(
            "documents.load.remote.emptyGuard",
            new Error(
              `Refusing empty remote overwrite of local documents (${countDocumentsRecords(localRaw)} records).`,
            ),
          );
          documentsSnapshot = localRaw;
          return localRaw;
        }
        documentsSnapshot = normalized;
        blockedConflict = null;
        saveDocumentsLocal(documentsSnapshot);
        return documentsSnapshot;
      }
      if (!documentsVersion) documentsVersion = remote.version;
      return stabilizeDocumentsFileRefs(normalizeDocuments(remote.data));
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
  const normalized = normalizeDocuments(data);
  saveDocumentsLocal(normalized);

  const backendConfigured = await isServerApiConfigured();
  if (!backendConfigured) {
    documentsSnapshot = normalized;
    return normalized;
  }

  pendingWrites += 1;
  const task = async (): Promise<DocumentsData> => {
    try {
      if (conflictVersion) {
        documentsVersion = conflictVersion;
        blockedConflict = null;
      } else if (blockedConflict) {
        throw blockedConflict;
      }

      const before = normalizeDocuments(documentsSnapshot ?? (await loadDocuments()));
      const upserts: Partial<Record<DocumentKey, DocumentEntity[]>> = {};
      const deletes: Partial<Record<DocumentKey, string[]>> = {};
      for (const key of ["agreements", "archiveDocuments"] as const) {
        const previous = new Map(before[key].map((item) => [item.id, item]));
        const next = new Map(normalized[key].map((item) => [item.id, item]));
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
      if (Object.keys(upserts).length === 0 && Object.keys(deletes).length === 0) {
        documentsSnapshot = normalized;
        return normalized;
      }

      const expectedVersion = conflictVersion ?? documentsVersion;
      if (!expectedVersion) throw new Error("Document version is not loaded.");

      const result = await saveDocumentsFn({
        data: {
          expectedVersion,
          upserts,
          deletes,
          allowedDeleteIds: options.allowAllDeletes ? undefined : (options.deleteIds ?? deletes),
          allowAllDeletes: options.allowAllDeletes === true,
        },
      });
      const authoritative = stabilizeDocumentsFileRefs(normalizeDocuments(result.data));
      documentsVersion = result.version;
      documentsSnapshot = authoritative;
      saveDocumentsLocal(authoritative);
      if (!result.ok) {
        const conflict = new DocumentsConflictError(
          authoritative,
          result.version,
          normalized,
          options,
          { upserts, deletes },
        );
        blockedConflict = conflict;
        throw conflict;
      }
      blockedConflict = null;
      return authoritative;
    } finally {
      pendingWrites = Math.max(0, pendingWrites - 1);
    }
  };

  const queued = writeQueue.then(task, task);
  writeQueue = queued.catch((error) => {
    if (!(error instanceof DocumentsConflictError)) {
      logClientError("documents.save.remote", error);
    }
  });
  return queued;
}
