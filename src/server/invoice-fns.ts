import { createServerFn } from "@tanstack/react-start";
import type { CompanySettings, Invoice } from "@/lib/types";
import {
  assertRelationalMode,
  getSupabaseServerConfig,
  relationalReadsEnabled,
} from "./env";
import {
  getRelationalInvoice,
  listRelationalInvoices,
  loadRelationalCompany,
} from "./relational-read-repository";
import {
  saveRelationalCompany,
  softDeleteRelationalInvoice,
  upsertRelationalInvoice,
} from "./relational-write-repository";
import { assertAppSession } from "./app-session";
import { CACHE_KEYS, cacheDel, cacheThrough } from "./data-cache";
import {
  isInvoiceNumberUniqueViolation,
  reassignInvoiceNumberOnConflict,
} from "@/lib/invoice-number";

const INVOICE_NUMBER_RETRY_ATTEMPTS = 8;

/** Public: lets the UI know if server-side Supabase is wired (no secrets leaked). */
export const getDataBackendStatus = createServerFn({ method: "GET" }).handler(async () => ({
  configured: Boolean(getSupabaseServerConfig()),
  relationalReads: relationalReadsEnabled(),
}));

export const listInvoicesFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<Invoice[]> => {
    await assertAppSession();
    assertRelationalMode();
    return cacheThrough(CACHE_KEYS.invoices, listRelationalInvoices);
  },
);

export const getInvoiceFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => {
    if (!data?.id || typeof data.id !== "string") throw new Error("Invalid id");
    return data;
  })
  .handler(async ({ data }): Promise<Invoice | null> => {
    await assertAppSession();
    assertRelationalMode();
    return getRelationalInvoice(data.id);
  });

export const upsertInvoiceFn = createServerFn({ method: "POST" })
  .inputValidator((data: Invoice) => {
    if (!data?.id || typeof data.id !== "string") throw new Error("Invalid invoice");
    return data;
  })
  .handler(async ({ data }) => {
    await assertAppSession();
    assertRelationalMode();

    let candidate: Invoice = data;
    for (let attempt = 0; attempt < INVOICE_NUMBER_RETRY_ATTEMPTS; attempt++) {
      try {
        await upsertRelationalInvoice(candidate);
        cacheDel(CACHE_KEYS.invoices);
        return { ok: true as const, invoice: candidate };
      } catch (error) {
        if (!isInvoiceNumberUniqueViolation(error) || attempt === INVOICE_NUMBER_RETRY_ATTEMPTS - 1) {
          throw error;
        }
        const existing = await listRelationalInvoices();
        const nextNumber = reassignInvoiceNumberOnConflict(
          candidate,
          existing.map((invoice) => ({ id: invoice.id, number: invoice.number })),
        );
        if (nextNumber === candidate.number) throw error;
        candidate = { ...candidate, number: nextNumber };
      }
    }
    throw new Error("Could not assign a unique invoice number");
  });

export const deleteInvoiceFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => {
    if (!data?.id || typeof data.id !== "string") throw new Error("Invalid id");
    return data;
  })
  .handler(async ({ data }) => {
    await assertAppSession();
    assertRelationalMode();
    await softDeleteRelationalInvoice(data.id);
    cacheDel(CACHE_KEYS.invoices);
    return { ok: true as const };
  });

export const getCompanyFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<CompanySettings> => {
    await assertAppSession();
    assertRelationalMode();
    return cacheThrough(CACHE_KEYS.company, loadRelationalCompany);
  },
);

export const saveCompanyFn = createServerFn({ method: "POST" })
  .inputValidator((data: CompanySettings) => data)
  .handler(async ({ data }) => {
    await assertAppSession();
    assertRelationalMode();
    await saveRelationalCompany(data);
    cacheDel(CACHE_KEYS.company);
    return { ok: true as const };
  });
