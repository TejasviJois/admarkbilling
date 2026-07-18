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
  items: { active: boolean; amountPerMonth: number; status?: string }[] | undefined,
): number {
  return (items ?? [])
    .filter((e) => e.active && e.status !== "completed" && e.status !== "paused")
    .reduce((s, e) => s + (e.amountPerMonth || 0), 0);
}

export type FixedMonthlyPaymentStatus = "active" | "paused" | "completed";

export function fixedMonthlyStatus(item: FixedMonthlyExpense): FixedMonthlyPaymentStatus {
  if (item.status === "completed") return "completed";
  if (item.status === "paused" || !item.active) return "paused";
  if (
    item.totalMonths != null &&
    new Set(item.paidMonths ?? []).size >= item.totalMonths
  ) {
    return "completed";
  }
  return "active";
}

export function fixedMonthlyStatusLabel(item: FixedMonthlyExpense): string {
  const status = fixedMonthlyStatus(item);
  if (status === "completed") return "Completed";
  if (status === "paused") return "Paused";
  return "Active";
}

export function monthKeyFromDate(date: string): string {
  return /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : new Date().toISOString().slice(0, 7);
}

export function addMonthsToKey(monthKey: string, offset: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function fixedMonthlyDueDate(item: FixedMonthlyExpense, monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  const requestedDay = item.reminderDay ?? (Number(item.startDate.slice(8, 10)) || 1);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${monthKey}-${String(Math.min(Math.max(requestedDay, 1), lastDay)).padStart(2, "0")}`;
}

/**
 * All fixed installments, or for an ongoing payment: months from start through
 * the current month plus a small future window for manual planning.
 */
export function fixedMonthlyScheduleMonths(
  item: FixedMonthlyExpense,
  asOfDate?: string,
  futureMonths = 2,
): string[] {
  const start = monthKeyFromDate(item.startDate);
  if (item.totalMonths != null && item.totalMonths > 0) {
    return Array.from({ length: item.totalMonths }, (_, index) => addMonthsToKey(start, index));
  }

  const current = monthKeyFromDate(asOfDate ?? new Date().toISOString().slice(0, 10));
  const [startYear, startMonth] = start.split("-").map(Number);
  const [currentYear, currentMonth] = current.split("-").map(Number);
  const elapsed = Math.max(0, (currentYear - startYear) * 12 + currentMonth - startMonth);
  const count = Math.min(120, elapsed + futureMonths + 1);
  return Array.from({ length: count }, (_, index) => addMonthsToKey(start, index));
}

export function fixedMonthlyPaidCount(item: FixedMonthlyExpense): number {
  const start = monthKeyFromDate(item.startDate);
  if (item.totalMonths == null) {
    return new Set(
      (item.paidMonths ?? []).filter(
        (month) => /^\d{4}-\d{2}$/.test(month) && month >= start,
      ),
    ).size;
  }
  const valid = new Set(fixedMonthlyScheduleMonths(item, undefined, 0));
  return new Set((item.paidMonths ?? []).filter((month) => valid.has(month))).size;
}

/** Null means an ongoing payment with no fixed final installment. */
export function fixedMonthlyMonthsRemaining(item: FixedMonthlyExpense): number | null {
  if (item.totalMonths == null) return null;
  return Math.max(0, item.totalMonths - fixedMonthlyPaidCount(item));
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
