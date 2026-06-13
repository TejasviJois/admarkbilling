import type { FinancialBaseline } from "./types";

/** Apr–Jun 2026 historical totals — reconciled from bank records; no per-entry proof. */
export const DEFAULT_FINANCIAL_BASELINE: FinancialBaseline = {
  periodLabel: "Past two months (historical baseline)",
  asOfDate: "2026-06-11",
  /** Optional manual override; when null, derived from active project pipeline. */
  totalRevenueBooked: null,
  /** Prajwal loan — not disbursed / repaid yet; EMI tracked separately from Jul 5. */
  totalHandoutsTaken: 0,
  totalRevenueReceived: 102_425,
  totalExternalPayouts: 0,
  totalCompanyExpenses: 0,
  founderPayoutPool: 0,
};

export function withDefaultFinancialBaseline<T extends { financialBaseline?: FinancialBaseline }>(
  data: T,
): T {
  if (!data.financialBaseline) {
    return { ...data, financialBaseline: DEFAULT_FINANCIAL_BASELINE };
  }
  return data;
}
