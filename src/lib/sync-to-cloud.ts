import type { ActivityLogEntry, DocumentsData, Invoice } from "@/lib/types";
import { syncAllToCloudFn } from "@/server/sync-fns";
import { isServerApiConfigured } from "@/lib/backend-status-cache";
import { DEFAULT_COMPANY } from "./constants";
import { normalizeCompanySettings } from "./company-settings";
import { DEFAULT_FINANCIAL_BASELINE } from "./default-financial-baseline";
import { logClientError } from "./client-logger";
import type { OperationsData as Ops } from "./types";

const KEYS = {
  invoices: "admark.invoices",
  company: "admark.company",
  operations: "admark.operations",
  documents: "admark.documents",
  activityLogs: "admark.activity-logs",
} as const;

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readJson<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function pushLocalDataToCloud(): Promise<{ synced: string[] }> {
  if (!(await isServerApiConfigured())) {
    throw new Error("Supabase is not configured on the server. Add env vars and redeploy.");
  }

  const payload = {
    company: normalizeCompanySettings(readJson(KEYS.company, DEFAULT_COMPANY)),
    operations: readJson<Ops>(KEYS.operations, {
      projects: [],
      partnerships: [],
      expenses: [],
      financialBaseline: DEFAULT_FINANCIAL_BASELINE,
    }),
    documents: readJson<DocumentsData>(KEYS.documents, {
      agreements: [],
      archiveDocuments: [],
    }),
    invoices: readJson<Invoice[]>(KEYS.invoices, []),
    activityLogs: readJson<ActivityLogEntry[]>(KEYS.activityLogs, []),
  };

  try {
    const result = await syncAllToCloudFn({ data: payload });
    return { synced: result.synced };
  } catch (e) {
    logClientError("sync-to-cloud", e);
    throw e instanceof Error ? e : new Error("Could not sync local data to Supabase.");
  }
}

export function hasLocalDataToSync(): boolean {
  if (!isBrowser()) return false;
  return Object.values(KEYS).some((key) => localStorage.getItem(key) != null);
}
