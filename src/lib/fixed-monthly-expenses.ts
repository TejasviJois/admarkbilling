import { formatINR } from "./invoice-calc";
import { periodBounds, type PeriodKey } from "./date-range-filter";
import type { FixedMonthlyExpense, FixedMonthlyExpenseKind } from "./types";

export const FIXED_MONTHLY_EXPENSE_KINDS: FixedMonthlyExpenseKind[] = [
  "salary",
  "emi",
  "rent",
  "subscription",
  "utility",
  "other",
];

export const FIXED_MONTHLY_EXPENSE_KIND_LABELS: Record<FixedMonthlyExpenseKind, string> = {
  salary: "Salary",
  emi: "EMI / loan",
  rent: "Rent",
  subscription: "Subscription",
  utility: "Utility",
  other: "Other",
};

export function normalizeFixedMonthlyKind(kind?: string): FixedMonthlyExpenseKind {
  if (kind && FIXED_MONTHLY_EXPENSE_KINDS.includes(kind as FixedMonthlyExpenseKind)) {
    return kind as FixedMonthlyExpenseKind;
  }
  return "other";
}

export function fixedMonthlyKindLabel(kind?: string): string {
  return FIXED_MONTHLY_EXPENSE_KIND_LABELS[normalizeFixedMonthlyKind(kind)];
}

export function sumActiveFixedMonthlyExpenses(
  items: { active: boolean; amountPerMonth: number }[] | undefined,
): number {
  return (items ?? []).filter((e) => e.active).reduce((s, e) => s + (e.amountPerMonth || 0), 0);
}

/** Estimate fixed monthly outflows that fall inside a date window (30-day month convention). */
export function proratedFixedMonthlyForPeriod(
  items: FixedMonthlyExpense[] | undefined,
  period: PeriodKey,
  asOfDate?: string,
): number {
  if (period === "all") return 0;

  const bounds = periodBounds(period, asOfDate);
  if (!bounds) return 0;

  let total = 0;
  for (const item of items ?? []) {
    if (!item.active || !(item.amountPerMonth > 0)) continue;
    const itemStart = item.startDate?.slice(0, 10) ?? bounds.start;
    const overlapStart = itemStart > bounds.start ? itemStart : bounds.start;
    if (overlapStart > bounds.end) continue;

    const start = new Date(`${overlapStart}T12:00:00`);
    const end = new Date(`${bounds.end}T12:00:00`);
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
    total += Math.round((item.amountPerMonth / 30) * days);
  }
  return total;
}

export function summarizeFixedMonthlyByKind(
  items: FixedMonthlyExpense[] | undefined,
): { kind: FixedMonthlyExpenseKind; label: string; total: number; count: number }[] {
  const active = (items ?? []).filter((e) => e.active);
  const byKind = new Map<FixedMonthlyExpenseKind, { total: number; count: number }>();

  for (const item of active) {
    const kind = normalizeFixedMonthlyKind(item.kind);
    const entry = byKind.get(kind) ?? { total: 0, count: 0 };
    entry.total += item.amountPerMonth || 0;
    entry.count += 1;
    byKind.set(kind, entry);
  }

  return FIXED_MONTHLY_EXPENSE_KINDS.filter((kind) => byKind.has(kind)).map((kind) => ({
    kind,
    label: FIXED_MONTHLY_EXPENSE_KIND_LABELS[kind],
    total: byKind.get(kind)!.total,
    count: byKind.get(kind)!.count,
  }));
}

export function formatFinancialINR(n: number): string {
  return formatINR(n);
}
