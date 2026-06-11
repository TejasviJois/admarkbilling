import type { CompanySettings, Invoice } from "./types";
import { DEFAULT_COMPANY } from "./constants";
import { normalizeCompanySettings } from "./company-settings";
import type { LogDraft } from "./activity-log";
import {
  deleteInvoiceFn,
  getCompanyFn,
  getDataBackendStatus,
  getInvoiceFn,
  listInvoicesFn,
  saveCompanyFn,
  upsertInvoiceFn,
} from "@/server/invoice-fns";

export { DEFAULT_COMPANY } from "./constants";
export { normalizeCompanySettings } from "./company-settings";

const INVOICES_KEY = "admark.invoices";
const COMPANY_KEY = "admark.company";

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

/* --- localStorage fallback when server env is not configured --- */

function loadInvoicesLocal(): Invoice[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(INVOICES_KEY);
    return raw ? (JSON.parse(raw) as Invoice[]) : [];
  } catch {
    return [];
  }
}

function saveInvoicesLocal(invs: Invoice[]) {
  if (!isBrowser()) return;
  localStorage.setItem(INVOICES_KEY, JSON.stringify(invs));
}

function loadCompanyLocal(): CompanySettings {
  if (!isBrowser()) return DEFAULT_COMPANY;
  try {
    const raw = localStorage.getItem(COMPANY_KEY);
    return raw
      ? normalizeCompanySettings(JSON.parse(raw) as CompanySettings)
      : DEFAULT_COMPANY;
  } catch {
    return DEFAULT_COMPANY;
  }
}

function saveCompanyLocal(c: CompanySettings) {
  if (!isBrowser()) return;
  localStorage.setItem(COMPANY_KEY, JSON.stringify(c));
}

let serverConfiguredCache: boolean | null = null;

async function recordActivity(draft: LogDraft) {
  const { appendActivityLog } = await import("./activity-log-storage");
  await appendActivityLog(draft);
}

async function serverApiEnabled(): Promise<boolean> {
  if (serverConfiguredCache !== null) return serverConfiguredCache;
  try {
    const s = await getDataBackendStatus();
    serverConfiguredCache = s.configured;
    return serverConfiguredCache;
  } catch {
    serverConfiguredCache = false;
    return false;
  }
}

/** @deprecated Prefer checking getDataBackendStatus in UI — kept for quick sync reads if needed */
export function usesRemoteDatabase(): boolean {
  return serverConfiguredCache === true;
}

export async function loadInvoices(): Promise<Invoice[]> {
  if (!(await serverApiEnabled())) return loadInvoicesLocal();
  return listInvoicesFn();
}

export async function upsertInvoice(inv: Invoice) {
  const existing = await getInvoice(inv.id);
  await recordActivity({
    entity: "invoice",
    action: existing ? "updated" : "created",
    entityId: inv.id,
    entityName: inv.number,
    summary: existing
      ? `Updated invoice ${inv.number} for ${inv.clientName}`
      : `Created invoice ${inv.number} for ${inv.clientName}`,
  });

  if (!(await serverApiEnabled())) {
    const all = loadInvoicesLocal();
    const idx = all.findIndex((i) => i.id === inv.id);
    if (idx >= 0) all[idx] = inv;
    else all.unshift(inv);
    saveInvoicesLocal(all);
    return;
  }
  await upsertInvoiceFn({ data: inv });
}

export async function deleteInvoice(id: string) {
  const existing = await getInvoice(id);
  if (existing) {
    await recordActivity({
      entity: "invoice",
      action: "deleted",
      entityId: existing.id,
      entityName: existing.number,
      summary: `Deleted invoice ${existing.number} for ${existing.clientName}`,
    });
  }

  if (!(await serverApiEnabled())) {
    saveInvoicesLocal(loadInvoicesLocal().filter((i) => i.id !== id));
    return;
  }
  await deleteInvoiceFn({ data: { id } });
}

export async function getInvoice(id: string): Promise<Invoice | undefined> {
  if (!(await serverApiEnabled())) {
    return loadInvoicesLocal().find((i) => i.id === id);
  }
  const inv = await getInvoiceFn({ data: { id } });
  return inv ?? undefined;
}

export async function loadCompany(): Promise<CompanySettings> {
  try {
    if (!(await serverApiEnabled())) return loadCompanyLocal();
    const remote = await getCompanyFn();
    return normalizeCompanySettings(remote);
  } catch {
    return loadCompanyLocal();
  }
}

export async function saveCompany(c: CompanySettings) {
  await recordActivity({
    entity: "settings",
    action: "updated",
    summary: "Updated company settings",
  });

  if (!(await serverApiEnabled())) {
    saveCompanyLocal(c);
    return;
  }
  await saveCompanyFn({ data: c });
}
