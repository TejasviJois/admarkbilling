import { createServerFn } from "@tanstack/react-start";
import type { ActivityLogEntry, CompanySettings, DocumentsData, Invoice, OperationsData } from "@/lib/types";
import { requireServerSupabase } from "./supabase-admin";
import { assertAppSession } from "./app-session";
import { CACHE_KEYS, cacheDel } from "./data-cache";
import {
  externalizeCompanySettings,
  externalizeDocumentsData,
  externalizeOperationsData,
} from "./payload-files";

export interface SyncAllPayload {
  company?: CompanySettings;
  operations?: OperationsData;
  documents?: DocumentsData;
  invoices?: Invoice[];
  activityLogs?: ActivityLogEntry[];
}

export const syncAllToCloudFn = createServerFn({ method: "POST" })
  .inputValidator((data: SyncAllPayload) => data)
  .handler(async ({ data }) => {
    await assertAppSession();
    const sb = requireServerSupabase();
    const synced: string[] = [];
    const now = new Date().toISOString();

    if (data.company) {
      const payload = await externalizeCompanySettings(sb, data.company);
      const { error } = await sb.from("company_settings").upsert({
        id: "default",
        payload,
        updated_at: now,
      });
      if (error) throw error;
      cacheDel(CACHE_KEYS.company);
      synced.push("company settings");
    }

    if (data.operations) {
      const payload = await externalizeOperationsData(sb, data.operations);
      const { error } = await sb.from("operations_data").upsert({
        id: "default",
        payload,
        updated_at: now,
      });
      if (error) throw error;
      cacheDel(CACHE_KEYS.operations);
      synced.push("operations");
    }

    if (data.documents) {
      const payload = await externalizeDocumentsData(sb, data.documents);
      const { error } = await sb.from("operations_data").upsert({
        id: "documents",
        payload,
        updated_at: now,
      });
      if (error) throw error;
      cacheDel(CACHE_KEYS.documents);
      synced.push("documents");
    }

    if (data.invoices?.length) {
      const rows = data.invoices.map((inv) => ({
        id: inv.id,
        payload: inv,
        created_at: new Date(inv.createdAt).toISOString(),
      }));
      const { error } = await sb.from("invoices").upsert(rows);
      if (error) throw error;
      cacheDel(CACHE_KEYS.invoices);
      synced.push(`${data.invoices.length} invoice(s)`);
    }

    if (data.activityLogs) {
      const { error } = await sb.from("operations_data").upsert({
        id: "activity_logs",
        payload: { entries: data.activityLogs },
        updated_at: now,
      });
      if (error) throw error;
      synced.push("activity logs");
    }

    return { ok: true as const, synced };
  });
