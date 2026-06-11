import { createServerFn } from "@tanstack/react-start";
import type { FinancialBaseline, FixedMonthlyExpense, OperationsData } from "@/lib/types";
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

function parseOperationsPayload(payload: unknown): OperationsData {
  if (!payload || typeof payload !== "object") return EMPTY_OPERATIONS;
  const raw = payload as Partial<OperationsData>;
  const fixedMonthlyExpenses = Array.isArray(raw.fixedMonthlyExpenses)
    ? raw.fixedMonthlyExpenses.map(parseFixedMonthlyExpense).filter((e): e is FixedMonthlyExpense => e != null)
    : undefined;
  const assets = Array.isArray(raw.assets) ? raw.assets : [];
  return {
    projects: Array.isArray(raw.projects) ? raw.projects : [],
    partnerships: Array.isArray(raw.partnerships) ? raw.partnerships : [],
    expenses: Array.isArray(raw.expenses) ? raw.expenses : [],
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
