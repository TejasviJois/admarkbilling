import type { ActivityLogEntry, DocumentsData, Invoice } from "@/lib/types";
import { syncAllToCloudFn } from "@/server/sync-fns";
import { isServerApiConfigured } from "@/lib/backend-status-cache";
import { DEFAULT_COMPANY } from "./constants";
import { normalizeCompanySettings } from "./company-settings";
import { DEFAULT_FINANCIAL_BASELINE } from "./default-financial-baseline";
import { logClientError } from "./client-logger";
import { countDocumentsRecords, countOperationsRecords } from "./stabilize-file-refs";
import type { OperationsData as Ops } from "./types";

const KEYS = {
  invoices: "admark.invoices",
  company: "admark.company",
  operations: "admark.operations.v2",
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

function hasOperationsKey(): boolean {
  return isBrowser() && localStorage.getItem(KEYS.operations) != null;
}

function hasDocumentsKey(): boolean {
  return isBrowser() && localStorage.getItem(KEYS.documents) != null;
}

export async function pushLocalDataToCloud(): Promise<{ synced: string[] }> {
  if (!(await isServerApiConfigured())) {
    throw new Error("Supabase is not configured on the server. Add env vars and redeploy.");
  }

  const operations = hasOperationsKey()
    ? readJson<Ops>(KEYS.operations, {
        projects: [],
        partnerships: [],
        expenses: [],
        financialBaseline: DEFAULT_FINANCIAL_BASELINE,
      })
    : undefined;
  const documents = hasDocumentsKey()
    ? readJson<DocumentsData>(KEYS.documents, {
        agreements: [],
        archiveDocuments: [],
      })
    : undefined;

  // Never push an empty ops/docs snapshot — that soft-deletes live cloud rows.
  if (operations && countOperationsRecords(operations) === 0) {
    throw new Error(
      "Local operations data is empty. Sync refused to avoid wiping cloud CRM / billing records.",
    );
  }
  if (documents && countDocumentsRecords(documents) === 0) {
    throw new Error(
      "Local documents data is empty. Sync refused to avoid wiping cloud vault files.",
    );
  }

  const payload = {
    company: normalizeCompanySettings(readJson(KEYS.company, DEFAULT_COMPANY)),
    ...(operations ? { operations } : {}),
    ...(documents ? { documents } : {}),
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
