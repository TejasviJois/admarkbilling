import { createServerFn } from "@tanstack/react-start";
import type { FinancialBaseline, FixedMonthlyExpense, Lead, OperationsData } from "@/lib/types";
import { DEFAULT_FINANCIAL_BASELINE } from "@/lib/default-financial-baseline";
import { requireServerSupabase } from "./supabase-admin";
import { assertAppSession } from "./app-session";
import { CACHE_KEYS, cacheDel, cacheThrough } from "./data-cache";

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
  return {
    projects: Array.isArray(raw.projects) ? raw.projects : [],
    partnerships: Array.isArray(raw.partnerships) ? raw.partnerships : [],
    expenses: Array.isArray(raw.expenses) ? raw.expenses : [],
    leads,
    assets,
    financialBaseline: parseFinancialBaseline(raw.financialBaseline) ?? DEFAULT_FINANCIAL_BASELINE,
    fixedMonthlyExpenses,
  };
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
        .maybeSingle();
      if (error) throw error;
      if (!data?.payload) return EMPTY_OPERATIONS;
      return parseOperationsPayload(data.payload);
    });
  },
);

export const saveOperationsFn = createServerFn({ method: "POST" })
  .inputValidator((data: OperationsData) => data)
  .handler(async ({ data }) => {
    await assertAppSession();
    const sb = requireServerSupabase();
    const { error } = await sb.from("operations_data").upsert({
      id: "default",
      payload: data,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    cacheDel(CACHE_KEYS.operations);
    return { ok: true as const };
  });
