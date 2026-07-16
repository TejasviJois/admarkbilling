import { createServerFn } from "@tanstack/react-start";
import type { Client, FinancialBaseline, FixedMonthlyExpense, Lead, OperationsData, Payment, Transaction, Founder, TransactionType } from "@/lib/types";
import { DEFAULT_FINANCIAL_BASELINE } from "@/lib/default-financial-baseline";
import { requireServerSupabase } from "./supabase-admin";
import { assertAppSession } from "./app-session";
import { CACHE_KEYS, cacheDel, cacheThrough } from "./data-cache";
import { externalizeOperationsData } from "./payload-files";
import { relinkOrphanedPaymentProofs } from "./relink-payment-proofs";

export const EMPTY_OPERATIONS: OperationsData = {
  projects: [],
  partnerships: [],
  expenses: [],
  financialBaseline: DEFAULT_FINANCIAL_BASELINE,
};

function parseFinancialBaseline(raw: unknown): FinancialBaseline | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const b = raw as Partial<FinancialBaseline>;
  if (
    typeof b.asOfDate !== "string" ||
    typeof b.totalHandoutsTaken !== "number" ||
    typeof b.totalRevenueReceived !== "number"
  ) {
    return undefined;
  }
  return {
    periodLabel: b.periodLabel ?? DEFAULT_FINANCIAL_BASELINE.periodLabel,
    asOfDate: b.asOfDate,
    totalRevenueBooked: b.totalRevenueBooked ?? null,
    totalHandoutsTaken: b.totalHandoutsTaken,
    totalRevenueReceived: b.totalRevenueReceived,
    totalExternalPayouts: b.totalExternalPayouts ?? 0,
    totalCompanyExpenses: b.totalCompanyExpenses ?? 0,
    founderPayoutPool: b.founderPayoutPool ?? 0,
  };
}

function parseFixedMonthlyExpense(raw: unknown): FixedMonthlyExpense | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Partial<FixedMonthlyExpense>;
  if (typeof e.id !== "string" || typeof e.label !== "string" || typeof e.amountPerMonth !== "number") {
    return null;
  }
  return {
    id: e.id,
    label: e.label,
    amountPerMonth: e.amountPerMonth,
    kind: typeof e.kind === "string" ? e.kind : undefined,
    startDate: typeof e.startDate === "string" ? e.startDate : "2026-01-01",
    notes: e.notes,
    active: e.active !== false,
  };
}

function parseLead(raw: unknown): Lead | null {
  if (!raw || typeof raw !== "object") return null;
  const l = raw as Partial<Lead>;
  if (typeof l.id !== "string" || typeof l.name !== "string" || typeof l.business !== "string") {
    return null;
  }
  const status =
    l.status === "contacted" ||
    l.status === "qualified" ||
    l.status === "won" ||
    l.status === "lost"
      ? l.status
      : "new";
  return {
    id: l.id,
    name: l.name,
    business: l.business,
    phone: typeof l.phone === "string" ? l.phone : undefined,
    notes: typeof l.notes === "string" ? l.notes : undefined,
    status,
    createdAt: typeof l.createdAt === "string" ? l.createdAt : undefined,
  };
}

function parseClient(raw: unknown): Client | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Partial<Client>;
  if (typeof c.id !== "string" || typeof c.companyName !== "string") return null;
  return {
    id: c.id,
    organizationId: c.organizationId ?? DEFAULT_ORG_ID,
    companyName: c.companyName,
    contactPerson: c.contactPerson ?? "",
    phone: c.phone ?? "",
    email: c.email ?? "",
    gstNumber: c.gstNumber,
    pan: c.pan,
    billingAddress: c.billingAddress ?? "",
    shippingAddress: c.shippingAddress,
    website: c.website,
    industry: c.industry,
    clientSince: c.clientSince ?? new Date().toISOString().slice(0, 10),
    status: c.status === "inactive" ? "inactive" : "active",
    notes: c.notes,
  };
}

function parsePayment(raw: unknown): Payment | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<Payment>;
  if (typeof p.id !== "string" || typeof p.amount !== "number" || typeof p.date !== "string" || typeof p.method !== "string") {
    return null;
  }
  return {
    id: p.id,
    organizationId: p.organizationId ?? DEFAULT_ORG_ID,
    invoiceId: p.invoiceId,
    projectId: p.projectId,
    amount: p.amount,
    date: p.date,
    method: p.method,
    referenceNumber: p.referenceNumber,
    transactionId: p.transactionId,
    screenshotDataUrl: p.screenshotDataUrl,
    notes: p.notes,
  };
}

function parseFounder(raw: unknown): Founder | null {
  if (!raw || typeof raw !== "object") return null;
  const f = raw as Partial<Founder>;
  if (typeof f.id !== "string" || typeof f.name !== "string" || typeof f.sharePercentage !== "number") return null;
  return {
    id: f.id,
    name: f.name,
    sharePercentage: f.sharePercentage,
    notes: f.notes,
  };
}

function parseTransaction(raw: unknown): Transaction | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Partial<Transaction>;
  if (
    typeof t.id !== "string" ||
    typeof t.type !== "string" ||
    typeof t.date !== "string" ||
    typeof t.amount !== "number" ||
    typeof t.description !== "string"
  ) {
    return null;
  }
  return {
    id: t.id,
    organizationId: t.organizationId ?? DEFAULT_ORG_ID,
    type: t.type as TransactionType,
    date: t.date,
    amount: t.amount,
    description: t.description,
    category: t.category ?? "",
    paymentMethod: t.paymentMethod ?? "",
    relatedClientId: t.relatedClientId,
    relatedProjectId: t.relatedProjectId,
    relatedInvoiceId: t.relatedInvoiceId,
    relatedFounderId: t.relatedFounderId,
    relatedVendorId: t.relatedVendorId,
    notes: t.notes,
    attachmentDataUrl: t.attachmentDataUrl,
    createdBy: t.createdBy,
    createdAt: typeof t.createdAt === "number" ? t.createdAt : Date.now(),
    updatedAt: typeof t.updatedAt === "number" ? t.updatedAt : Date.now(),
    historical: t.historical === true,
  };
}

const DEFAULT_ORG_ID = "org-admark-digitals";

const DEFAULT_FOUNDERS: Founder[] = [
  { id: "member-harshith", name: "Harshith V Malipatil", sharePercentage: 25 },
  { id: "member-prajwal", name: "Prajwal BP", sharePercentage: 25 },
  { id: "member-tejasvi", name: "Tejasvi Jois", sharePercentage: 25 },
  { id: "member-revanth", name: "Revanth Kumar S", sharePercentage: 25 },
];

function injectTenantIntoOperations(data: OperationsData): OperationsData {
  return {
    ...data,
    projects: data.projects.map((p) => ({ ...p, organizationId: DEFAULT_ORG_ID })),
    partnerships: data.partnerships.map((p) => ({ ...p, organizationId: DEFAULT_ORG_ID })),
    expenses: data.expenses.map((e) => ({ ...e, organizationId: DEFAULT_ORG_ID })),
    leads: data.leads?.map((l) => ({ ...l, organizationId: DEFAULT_ORG_ID })),
    assets: data.assets?.map((a) => ({ ...a, organizationId: DEFAULT_ORG_ID })),
    clients: data.clients?.map((c) => ({ ...c, organizationId: DEFAULT_ORG_ID })),
    payments: data.payments?.map((pay) => ({ ...pay, organizationId: DEFAULT_ORG_ID })),
    transactions: data.transactions?.map((t) => ({ ...t, organizationId: DEFAULT_ORG_ID })),
  };
}

function parseOperationsPayload(payload: unknown): OperationsData {
  if (!payload || typeof payload !== "object") return EMPTY_OPERATIONS;
  const raw = payload as Partial<OperationsData>;
  const fixedMonthlyExpenses = Array.isArray(raw.fixedMonthlyExpenses)
    ? raw.fixedMonthlyExpenses.map(parseFixedMonthlyExpense).filter((e): e is FixedMonthlyExpense => e != null)
    : undefined;
  const assets = Array.isArray(raw.assets) ? raw.assets : [];
  const leads = Array.isArray(raw.leads)
    ? raw.leads.map(parseLead).filter((l): l is Lead => l != null)
    : undefined;
  const clients = Array.isArray(raw.clients)
    ? raw.clients.map(parseClient).filter((c): c is Client => c != null)
    : undefined;
  const payments = Array.isArray(raw.payments)
    ? raw.payments.map(parsePayment).filter((pay): pay is Payment => pay != null)
    : undefined;
  const transactions = Array.isArray(raw.transactions)
    ? raw.transactions.map(parseTransaction).filter((t): t is Transaction => t != null)
    : undefined;
  const founders = Array.isArray(raw.founders)
    ? raw.founders.map(parseFounder).filter((f): f is Founder => f != null)
    : DEFAULT_FOUNDERS;
  const parsed = {
    projects: Array.isArray(raw.projects) ? raw.projects : [],
    partnerships: Array.isArray(raw.partnerships) ? raw.partnerships : [],
    expenses: Array.isArray(raw.expenses) ? raw.expenses : [],
    leads,
    assets,
    financialBaseline: parseFinancialBaseline(raw.financialBaseline) ?? DEFAULT_FINANCIAL_BASELINE,
    fixedMonthlyExpenses,
    clients,
    payments,
    transactions,
    founders,
    migrationApplied: raw.migrationApplied === true,
    migrationDate: typeof raw.migrationDate === "string" ? raw.migrationDate : undefined,
  };
  return injectTenantIntoOperations(parsed);
}

export const getOperationsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<OperationsData> => {
    await assertAppSession();
    return cacheThrough(CACHE_KEYS.operations, async () => {
      const sb = requireServerSupabase();
      const { data, error } = await sb
        .from("operations_data")
        .select("payload")
        .eq("id", "default")
        .eq("organization_id", DEFAULT_ORG_ID)
        .maybeSingle();
      if (error) throw error;
      if (!data?.payload) return injectTenantIntoOperations(EMPTY_OPERATIONS);

      let ops = parseOperationsPayload(data.payload);
      try {
        const relinked = await relinkOrphanedPaymentProofs(sb, ops);
        if (relinked.changed) {
          const payload = await externalizeOperationsData(sb, relinked.data);
          const payloadWithTenant = { ...payload, organizationId: DEFAULT_ORG_ID };
          const { error: saveError } = await sb.from("operations_data").upsert({
            id: "default",
            payload: payloadWithTenant,
            organization_id: DEFAULT_ORG_ID,
            updated_at: new Date().toISOString(),
          });
          if (saveError) throw saveError;
          ops = relinked.data;
        }
      } catch (relinkError) {
        console.error("[operations] payment proof relink failed:", relinkError);
      }

      return ops;
    });
  },
);

export const saveOperationsFn = createServerFn({ method: "POST" })
  .inputValidator((data: OperationsData) => data)
  .handler(async ({ data }) => {
    await assertAppSession();
    const sb = requireServerSupabase();
    const payload = await externalizeOperationsData(sb, data);
    const payloadWithTenant = { ...payload, organizationId: DEFAULT_ORG_ID };
    const { error } = await sb.from("operations_data").upsert({
      id: "default",
      payload: payloadWithTenant,
      organization_id: DEFAULT_ORG_ID,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    cacheDel(CACHE_KEYS.operations);
    return { ok: true as const };
  });
