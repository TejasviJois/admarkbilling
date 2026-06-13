import type { FixedMonthlyExpense } from "./types";

/** Prajwal handout / loan — EMI starts on the 5th of next month; not counted until then. */
export const DEFAULT_FIXED_MONTHLY_EXPENSES: FixedMonthlyExpense[] = [
  {
    id: "fixed-prajwal-loan-emi",
    label: "Prajwal — company loan EMI",
    amountPerMonth: 20_000,
    kind: "emi",
    startDate: "2026-07-05",
    notes: "Handout / loan from Prajwal — not yet paid. First EMI due 5th of next month.",
    active: true,
  },
];

export function withDefaultFixedMonthlyExpenses<T extends { fixedMonthlyExpenses?: FixedMonthlyExpense[] }>(
  data: T,
): T {
  const existing = data.fixedMonthlyExpenses ?? [];
  const hasPrajwal = existing.some((e) => e.id === "fixed-prajwal-loan-emi");
  if (hasPrajwal) return data;
  return { ...data, fixedMonthlyExpenses: [...existing, ...DEFAULT_FIXED_MONTHLY_EXPENSES] };
}
