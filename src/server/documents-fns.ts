import { createServerFn } from "@tanstack/react-start";
import type { Agreement, DocumentsData } from "@/lib/types";
import { requireServerSupabase } from "./supabase-admin";
import { assertAppSession } from "./app-session";
import { CACHE_KEYS, cacheDel, cacheThrough } from "./data-cache";
import { externalizeDocumentsData } from "./payload-files";
import { relationalDualWritesEnabled, relationalReadsEnabled } from "./env";
import { loadRelationalDocuments } from "./relational-read-repository";
import { saveRelationalDocuments } from "./relational-write-repository";

const DEFAULT_ORG_ID = "org-admark-digitals";

export const EMPTY_DOCUMENTS: DocumentsData = { agreements: [] };

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

function parseDocumentsPayload(payload: unknown): DocumentsData {
  if (!payload || typeof payload !== "object") return EMPTY_DOCUMENTS;
  const raw = payload as Partial<DocumentsData>;
  const agreements = Array.isArray(raw.agreements)
    ? raw.agreements.map(parseAgreement).filter((a): a is Agreement => a != null)
    : [];
  return { agreements };
}

export const getDocumentsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<DocumentsData> => {
    await assertAppSession();
    if (relationalReadsEnabled()) {
      return cacheThrough(CACHE_KEYS.documents, loadRelationalDocuments);
    }
    return cacheThrough(CACHE_KEYS.documents, async () => {
      const sb = requireServerSupabase();
      const { data, error } = await sb
        .from("operations_data")
        .select("payload")
        .eq("id", "documents")
        .maybeSingle();
      if (error) throw error;
      if (!data?.payload) return EMPTY_DOCUMENTS;
      return parseDocumentsPayload(data.payload);
    });
  },
);

export const saveDocumentsFn = createServerFn({ method: "POST" })
  .inputValidator((data: DocumentsData) => data)
  .handler(async ({ data }) => {
    await assertAppSession();
    const sb = requireServerSupabase();
    const payload = await externalizeDocumentsData(sb, data);
    const payloadWithTenant = {
      ...payload,
      agreements: payload.agreements.map((a) => ({ ...a, organizationId: DEFAULT_ORG_ID })),
      organizationId: DEFAULT_ORG_ID,
    };
    const { error } = await sb.from("operations_data").upsert({
      id: "documents",
      payload: payloadWithTenant,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    if (relationalReadsEnabled() || relationalDualWritesEnabled()) {
      await saveRelationalDocuments(data);
    }
    cacheDel(CACHE_KEYS.documents);
    return { ok: true as const };
  });
