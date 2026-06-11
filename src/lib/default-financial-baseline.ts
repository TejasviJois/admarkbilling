import type { FinancialBaseline } from "./types";

/** Apr–Jun 2026 historical totals — reconciled from bank records; no per-entry proof. */
export const DEFAULT_FINANCIAL_BASELINE: FinancialBaseline = {
  periodLabel: "Past two months (historical baseline)",
  asOfDate: "2026-06-11",
  totalRevenueBooked: null,
  totalHandoutsTaken: 121_500,
  totalRevenueReceived: 102_425,
  totalExternalPayouts: 10_000,
  totalCompanyExpenses: 20_634.36,
  founderPayoutPool: 14_466.1,
};

export function withDefaultFinancialBaseline<T extends { financialBaseline?: FinancialBaseline }>(
  data: T,
): T {
  if (data.financialBaseline) return data;
  return { ...data, financialBaseline: DEFAULT_FINANCIAL_BASELINE };
}
