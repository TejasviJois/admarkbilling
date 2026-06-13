import type { FixedMonthlyExpense } from "./types";

/** Prajwal handout / loan — EMI starts on the 5th of next month; not counted until then. */
export const DEFAULT_FIXED_MONTHLY_EXPENSES: FixedMonthlyExpense[] = [
  {
    id: "fixed-prajwal-loan-emi",
    label: "Prajwal — company loan EMI",
    amountPerMonth: 20_000,
    kind: "emi",
    startDate: "2026-07-05",
    notes: "Handout from Prajwal — loan not disbursed yet. First EMI on the 5th.",
    active: true,
  },
];

export function withDefaultFixedMonthlyExpenses<T extends { fixedMonthlyExpenses?: FixedMonthlyExpense[] }>(
  data: T,
): T {
  if (data.fixedMonthlyExpenses && data.fixedMonthlyExpenses.length > 0) return data;
  return { ...data, fixedMonthlyExpenses: DEFAULT_FIXED_MONTHLY_EXPENSES };
}
