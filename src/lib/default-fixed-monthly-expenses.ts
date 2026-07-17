import type { FixedMonthlyExpense } from "./types";

/** Prajwal handout / loan — first ₹20k EMI due 5 Aug 2026; not counted before then. */
export const DEFAULT_FIXED_MONTHLY_EXPENSES: FixedMonthlyExpense[] = [
  {
    id: "fixed-prajwal-loan-emi",
    label: "Prajwal — company loan EMI",
    amountPerMonth: 20_000,
    kind: "emi",
    startDate: "2026-08-05",
    notes: "Repayment of the ₹1,23,745 handout — ₹20,000/month starting 5 Aug 2026.",
    active: true,
  },
];

export function withDefaultFixedMonthlyExpenses<T extends { fixedMonthlyExpenses?: FixedMonthlyExpense[] }>(
  data: T,
): T {
  if (data.fixedMonthlyExpenses && data.fixedMonthlyExpenses.length > 0) return data;
  return { ...data, fixedMonthlyExpenses: DEFAULT_FIXED_MONTHLY_EXPENSES };
}
