import { createServerFn } from "@tanstack/react-start";
import type {
  ActivityLogEntry,
  CompanySettings,
  DocumentsData,
  Invoice,
  OperationsData,
} from "@/lib/types";
import { countDocumentsRecords, countOperationsRecords } from "@/lib/stabilize-file-refs";
import { requireServerSupabase } from "./supabase-admin";
import { assertAppSession } from "./app-session";
import { CACHE_KEYS, cacheDel } from "./data-cache";
import { externalizeDocumentsData, externalizeOperationsData } from "./payload-files";
import { assertRelationalMode } from "./env";
import {
  saveRelationalCompany,
  saveRelationalDocuments,
  saveRelationalOperations,
  replaceRelationalActivityLogs,
  upsertRelationalInvoice,
} from "./relational-write-repository";
import { loadRelationalDocuments, loadRelationalOperations } from "./relational-read-repository";

export interface SyncAllPayload {
  company?: CompanySettings;
  operations?: OperationsData;
  documents?: DocumentsData;
  invoices?: Invoice[];
  activityLogs?: ActivityLogEntry[];
}

const DEFAULT_ORG_ID = "org-admark-digitals";

export const syncAllToCloudFn = createServerFn({ method: "POST" })
  .inputValidator((data: SyncAllPayload) => data)
  .handler(async ({ data }) => {
    await assertAppSession();
    assertRelationalMode();
    const sb = requireServerSupabase();
    const synced: string[] = [];
    const now = new Date().toISOString();

    if (data.company) {
      await saveRelationalCompany(data.company);
      cacheDel(CACHE_KEYS.company);
      synced.push("company settings");
    }
    if (data.operations) {
      const incomingCount = countOperationsRecords(data.operations);
      if (incomingCount === 0) {
        const remote = await loadRelationalOperations();
        if (countOperationsRecords(remote) > 0) {
          throw new Error(
            "Refused empty operations sync — cloud already has CRM / billing records.",
          );
        }
      }
      const externalized = await externalizeOperationsData(sb, data.operations);
      await saveRelationalOperations(externalized);
      const { error } = await sb
        .from("operations_data")
        .update({ updated_at: now })
        .eq("id", "default");
      if (error) throw error;
      cacheDel(CACHE_KEYS.operations);
      synced.push("operations");
    }
    if (data.documents) {
      const incomingCount = countDocumentsRecords(data.documents);
      if (incomingCount === 0) {
        const remote = await loadRelationalDocuments();
        if (countDocumentsRecords(remote) > 0) {
          throw new Error("Refused empty documents sync — cloud vault already has files.");
        }
      }
      const externalized = await externalizeDocumentsData(sb, data.documents);
      await saveRelationalDocuments(externalized);
      const { error } = await sb
        .from("operations_data")
        .update({ updated_at: now })
        .eq("id", "documents");
      if (error) throw error;
      cacheDel(CACHE_KEYS.documents);
      synced.push("documents");
    }
    if (data.invoices?.length) {
      for (const invoice of data.invoices) {
        await upsertRelationalInvoice(invoice);
      }
      cacheDel(CACHE_KEYS.invoices);
      synced.push(`${data.invoices.length} invoice(s)`);
    }
    if (data.activityLogs) {
      await replaceRelationalActivityLogs(
        data.activityLogs.map((log) => ({ ...log, organizationId: DEFAULT_ORG_ID })),
      );
      const { error } = await sb
        .from("operations_data")
        .update({ updated_at: now })
        .eq("id", "activity_logs");
      if (error) throw error;
      synced.push("activity logs");
    }
    return { ok: true as const, synced };
  });
