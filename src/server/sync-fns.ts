import { createServerFn } from "@tanstack/react-start";
import type {
  ActivityLogEntry,
  CompanySettings,
  DocumentsData,
  Invoice,
  OperationsData,
} from "@/lib/types";
import { requireServerSupabase } from "./supabase-admin";
import { assertAppSession } from "./app-session";
import { CACHE_KEYS, cacheDel } from "./data-cache";
import {
  externalizeCompanySettings,
  externalizeDocumentsData,
  externalizeOperationsData,
} from "./payload-files";
import { encryptInvoice, encryptCompanySettings, encryptOperationsData } from "@/lib/encryption";
import {
  OPERATIONS_ENTITY_KEYS,
  OPERATIONS_SCALAR_KEYS,
  type OperationsMutation,
} from "@/lib/operations-mutations";

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
      const { data: current, error: currentError } = await sb
        .from("operations_data")
        .select("payload, updated_at")
        .eq("id", "default")
        .single();
      if (currentError) throw currentError;
      const currentPayload = current.payload as Record<string, unknown>;
      const upserts: OperationsMutation["upserts"] = {};
      for (const key of OPERATIONS_ENTITY_KEYS) {
        const existing = Array.isArray(currentPayload[key])
          ? (currentPayload[key] as Array<{ id?: string }>)
          : [];
        const existingIds = new Set(existing.map((item) => item.id).filter(Boolean));
        const incoming = Array.isArray(payloadWithTenant[key])
          ? (payloadWithTenant[key] as Array<{ id: string }>)
          : [];
        const missing = incoming.filter((item) => !existingIds.has(item.id));
        if (missing.length > 0) upserts[key] = missing as never;
      }
      const sets: OperationsMutation["sets"] = {};
      for (const key of OPERATIONS_SCALAR_KEYS) {
        if (currentPayload[key] == null && payloadWithTenant[key] != null) {
          sets[key] = payloadWithTenant[key] as never;
        }
      }
      const { data: mutationRows, error } = await sb.rpc("mutate_operations_data", {
        p_expected_updated_at: current.updated_at,
        p_upserts: upserts,
        p_deletes: {},
        p_sets: sets,
      });
      if (error) throw error;
      const mutationResult = mutationRows?.[0] as
        | { success?: boolean; is_conflict?: boolean }
        | undefined;
      if (!mutationResult?.success || mutationResult.is_conflict) {
        throw new Error("Cloud operations changed during sync. Reload and retry.");
      }
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
      const { data: current, error: currentError } = await sb
        .from("operations_data")
        .select("payload, updated_at")
        .eq("id", "documents")
        .single();
      if (currentError) throw currentError;
      for (const key of ["agreements", "archiveDocuments"] as const) {
        const existing = Array.isArray((current.payload as Record<string, unknown>)[key])
          ? ((current.payload as Record<string, unknown>)[key] as Array<{ id?: string }>)
          : [];
        const existingIds = new Set(existing.map((item) => item.id).filter(Boolean));
        const missing = payloadWithTenant[key].filter((item) => !existingIds.has(item.id));
        if (missing.length === 0) continue;
        const { data: mutationRows, error } = await sb.rpc("mutate_operations_aux_data", {
          p_row_id: "documents",
          p_expected_updated_at: current.updated_at,
          p_entity_key: key,
          p_upserts: missing,
          p_deletes: [],
        });
        if (error) throw error;
        const mutationResult = mutationRows?.[0] as
          | { success?: boolean; is_conflict?: boolean; result_updated_at?: string }
          | undefined;
        if (!mutationResult?.success || mutationResult.is_conflict) {
          throw new Error("Cloud documents changed during sync. Reload and retry.");
        }
        current.updated_at = mutationResult.result_updated_at ?? current.updated_at;
      }
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
      const logsWithTenant = data.activityLogs.map((log) => ({
        ...log,
        organizationId: DEFAULT_ORG_ID,
      }));
      const { data: current, error: currentError } = await sb
        .from("operations_data")
        .select("payload, updated_at")
        .eq("id", "activity_logs")
        .single();
      if (currentError) throw currentError;
      const existing = Array.isArray((current.payload as { entries?: unknown[] } | null)?.entries)
        ? (current.payload as { entries: Array<{ id?: string }> }).entries
        : [];
      const existingIds = new Set(existing.map((entry) => entry.id).filter(Boolean));
      const missing = logsWithTenant.filter((entry) => !existingIds.has(entry.id));
      if (missing.length > 0) {
        const { data: mutationRows, error } = await sb.rpc("mutate_operations_aux_data", {
          p_row_id: "activity_logs",
          p_expected_updated_at: current.updated_at,
          p_entity_key: "entries",
          p_upserts: missing,
          p_deletes: [],
        });
        if (error) throw error;
        const mutationResult = mutationRows?.[0] as
          | { success?: boolean; is_conflict?: boolean }
          | undefined;
        if (!mutationResult?.success || mutationResult.is_conflict) {
          throw new Error("Cloud activity logs changed during sync. Reload and retry.");
        }
      }
      synced.push("activity logs");
    }

    return { ok: true as const, synced };
  });
