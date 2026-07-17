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
import {
  encryptInvoice,
  encryptCompanySettings,
  encryptOperationsData,
} from "@/lib/encryption";

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
    const sb = requireServerSupabase();
    const synced: string[] = [];
    const now = new Date().toISOString();

    if (data.company) {
      const encrypted = encryptCompanySettings(data.company);
      const payload = await externalizeCompanySettings(sb, encrypted);
      const payloadWithTenant = { ...payload, organizationId: DEFAULT_ORG_ID };
      const { error } = await sb.from("company_settings").upsert({
        id: "default",
        payload: payloadWithTenant,
        updated_at: now,
      });
      if (error) throw error;
      cacheDel(CACHE_KEYS.company);
      synced.push("company settings");
    }

    if (data.operations) {
      const encrypted = encryptOperationsData(data.operations);
      const payload = await externalizeOperationsData(sb, encrypted);
      const payloadWithTenant = {
        ...payload,
        organizationId: DEFAULT_ORG_ID,
        projects: payload.projects.map((p) => ({ ...p, organizationId: DEFAULT_ORG_ID })),
        partnerships: payload.partnerships.map((p) => ({ ...p, organizationId: DEFAULT_ORG_ID })),
        expenses: payload.expenses.map((e) => ({ ...e, organizationId: DEFAULT_ORG_ID })),
        leads: payload.leads?.map((l) => ({ ...l, organizationId: DEFAULT_ORG_ID })),
        assets: payload.assets?.map((a) => ({ ...a, organizationId: DEFAULT_ORG_ID })),
      };
      const { error } = await sb.from("operations_data").upsert({
        id: "default",
        payload: payloadWithTenant,
        updated_at: now,
      });
      if (error) throw error;
      cacheDel(CACHE_KEYS.operations);
      synced.push("operations");
    }

    if (data.documents) {
      const payload = await externalizeDocumentsData(sb, data.documents);
      const payloadWithTenant = {
        ...payload,
        organizationId: DEFAULT_ORG_ID,
        agreements: payload.agreements.map((a) => ({ ...a, organizationId: DEFAULT_ORG_ID })),
      };
      const { error } = await sb.from("operations_data").upsert({
        id: "documents",
        payload: payloadWithTenant,
        updated_at: now,
      });
      if (error) throw error;
      cacheDel(CACHE_KEYS.documents);
      synced.push("documents");
    }

    if (data.invoices?.length) {
      const rows = data.invoices.map((inv) => {
        const encrypted = encryptInvoice(inv);
        return {
          id: inv.id,
          payload: { ...encrypted, organizationId: DEFAULT_ORG_ID },
          created_at: new Date(inv.createdAt).toISOString(),
        };
      });
      const { error } = await sb.from("invoices").upsert(rows);
      if (error) throw error;
      cacheDel(CACHE_KEYS.invoices);
      synced.push(`${data.invoices.length} invoice(s)`);
    }

    if (data.activityLogs) {
      const logsWithTenant = data.activityLogs.map((log) => ({ ...log, organizationId: DEFAULT_ORG_ID }));
      const { error } = await sb.from("operations_data").upsert({
        id: "activity_logs",
        payload: { entries: logsWithTenant, organizationId: DEFAULT_ORG_ID },
        updated_at: now,
      });
      if (error) throw error;
      synced.push("activity logs");
    }

    return { ok: true as const, synced };
  });
