import type { FixedMonthlyExpense } from "./types";

/** Recurring monthly outflows — loan repayments, rent, subscriptions, etc. */
export const DEFAULT_FIXED_MONTHLY_EXPENSES: FixedMonthlyExpense[] = [
  {
    id: "fixed-loan-repayment",
    label: "Company loan — monthly repayment",
    amountPerMonth: 20_000,
    kind: "emi",
    startDate: "2026-07-01",
    notes: "Outstanding handout / company loan — monthly repayment to lender until cleared.",
    active: true,
  },
];

export function withDefaultFixedMonthlyExpenses<T extends { fixedMonthlyExpenses?: FixedMonthlyExpense[] }>(
  data: T,
): T {
  if (data.fixedMonthlyExpenses && data.fixedMonthlyExpenses.length > 0) return data;
  return { ...data, fixedMonthlyExpenses: DEFAULT_FIXED_MONTHLY_EXPENSES };
}
