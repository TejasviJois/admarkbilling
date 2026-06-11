import type { DocumentsData } from "@/lib/types";
import { logClientError } from "./client-logger";
import { getDocumentsFn, saveDocumentsFn, EMPTY_DOCUMENTS } from "@/server/documents-fns";
import { getDataBackendStatus } from "@/server/invoice-fns";

const DOCUMENTS_KEY = "admark.documents";

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
      saveDocumentsLocal(remote);
      return remote;
    }
  } catch (e) {
    logClientError("documents.load.remote", e);
  }
  return loadDocumentsLocal();
}

export async function saveDocuments(data: DocumentsData): Promise<void> {
  saveDocumentsLocal(data);
  try {
    const backend = await getDataBackendStatus();
    if (backend.configured) {
      await saveDocumentsFn({ data });
    }
  } catch (e) {
    logClientError("documents.save.remote", e);
    throw e instanceof Error ? e : new Error("Could not save documents to server.");
  }
}
