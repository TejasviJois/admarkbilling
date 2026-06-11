import { createServerFn } from "@tanstack/react-start";
import type { CompanySettings, Invoice } from "@/lib/types";
import { DEFAULT_COMPANY } from "@/lib/constants";
import { normalizeCompanySettings } from "@/lib/company-settings";
import { getSupabaseServerConfig } from "./env";
import { requireServerSupabase } from "./supabase-admin";
import { assertAppSession } from "./app-session";
import { CACHE_KEYS, cacheDel, cacheThrough } from "./data-cache";

function parseInvoicePayload(payload: unknown): Invoice | null {
  if (!payload || typeof payload !== "object") return null;
  const inv = payload as Invoice;
  if (typeof inv.id !== "string" || typeof inv.number !== "string") return null;
  return inv;
}

/** Public: lets the UI know if server-side Supabase is wired (no secrets leaked). */
export const getDataBackendStatus = createServerFn({ method: "GET" }).handler(async () => ({
  configured: Boolean(getSupabaseServerConfig()),
}));

export const listInvoicesFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<Invoice[]> => {
    await assertAppSession();
    return cacheThrough(CACHE_KEYS.invoices, async () => {
      const sb = requireServerSupabase();
      const { data, error } = await sb
        .from("invoices")
        .select("payload, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const list: Invoice[] = [];
      for (const row of data ?? []) {
        const inv = parseInvoicePayload(row.payload);
        if (inv) list.push(inv);
      }
      return list;
    });
  },
);

export const getInvoiceFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => {
    if (!data?.id || typeof data.id !== "string") throw new Error("Invalid id");
    return data;
  })
  .handler(async ({ data }): Promise<Invoice | null> => {
    await assertAppSession();
    const sb = requireServerSupabase();
    const { data: row, error } = await sb
      .from("invoices")
      .select("payload")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    return row?.payload ? parseInvoicePayload(row.payload) : null;
  });

export const upsertInvoiceFn = createServerFn({ method: "POST" })
  .inputValidator((data: Invoice) => {
    if (!data?.id || typeof data.id !== "string") throw new Error("Invalid invoice");
    return data;
  })
  .handler(async ({ data }) => {
    await assertAppSession();
    const sb = requireServerSupabase();
    const { error } = await sb.from("invoices").upsert({
      id: data.id,
      payload: data,
      created_at: new Date(data.createdAt).toISOString(),
    });
    if (error) throw error;
    cacheDel(CACHE_KEYS.invoices);
    return { ok: true as const };
  });

export const deleteInvoiceFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => {
    if (!data?.id || typeof data.id !== "string") throw new Error("Invalid id");
    return data;
  })
  .handler(async ({ data }) => {
    await assertAppSession();
    const sb = requireServerSupabase();
    const { error } = await sb.from("invoices").delete().eq("id", data.id);
    if (error) throw error;
    cacheDel(CACHE_KEYS.invoices);
    return { ok: true as const };
  });

export const getCompanyFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<CompanySettings> => {
    await assertAppSession();
    return cacheThrough(CACHE_KEYS.company, async () => {
      const sb = requireServerSupabase();
      const { data, error } = await sb
        .from("company_settings")
        .select("payload")
        .eq("id", "default")
        .maybeSingle();
      if (error) throw error;
      if (!data?.payload || typeof data.payload !== "object") return DEFAULT_COMPANY;
      return normalizeCompanySettings(data.payload as CompanySettings);
    });
  },
);

export const saveCompanyFn = createServerFn({ method: "POST" })
  .inputValidator((data: CompanySettings) => data)
  .handler(async ({ data }) => {
    await assertAppSession();
    const sb = requireServerSupabase();
    const { error } = await sb.from("company_settings").upsert({
      id: "default",
      payload: data,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    cacheDel(CACHE_KEYS.company);
    return { ok: true as const };
  });
