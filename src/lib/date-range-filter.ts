import type { Project } from "@/lib/types";

export type PeriodKey = "all" | "1mo" | "3mo" | "6mo" | "1y";

/** Default time window — minimum 1 month. */
export const DEFAULT_PERIOD: PeriodKey = "1mo";

/** Month-based periods used across operations views (no day-level windows). */
export const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: "1mo", label: "1 month" },
  { value: "3mo", label: "3 months" },
  { value: "6mo", label: "6 months" },
  { value: "1y", label: "12 months" },
];

/** Analytics hub — includes all-time plus month windows. */
export const ANALYTICS_PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: "all", label: "All time" },
  ...PERIOD_OPTIONS,
];

export function periodLabel(period: PeriodKey): string {
  if (period === "all") return "All time";
  return PERIOD_OPTIONS.find((o) => o.value === period)?.label.toLowerCase() ?? "period";
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function periodBounds(
  period: PeriodKey,
  asOfDate?: string,
): { start: string; end: string } | null {
  if (period === "all") return null;

  const end = asOfDate ?? toISODate(new Date());
  const endDate = new Date(`${end}T12:00:00`);
  const startDate = new Date(endDate);

  switch (period) {
    case "1mo":
      startDate.setMonth(startDate.getMonth() - 1);
      break;
    case "3mo":
      startDate.setMonth(startDate.getMonth() - 3);
      break;
    case "6mo":
      startDate.setMonth(startDate.getMonth() - 6);
      break;
    case "1y":
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
  }

  return { start: toISODate(startDate), end };
}

export function isWithinPeriod(
  date: string | undefined | null,
  period: PeriodKey,
  asOfDate?: string,
): boolean {
  if (period === "all") return true;
  if (!date || date.length < 10) return false;
  const d = date.slice(0, 10);
  const bounds = periodBounds(period, asOfDate);
  if (!bounds) return true;
  return d >= bounds.start && d <= bounds.end;
}

/** True when any supplied date falls inside the period. Items with no dates are hidden when filtering. */
export function matchesAnyDateInPeriod(
  dates: (string | undefined | null)[],
  period: PeriodKey,
  asOfDate?: string,
): boolean {
  if (period === "all") return true;
  const valid = dates.map((d) => d?.slice(0, 10)).filter(Boolean) as string[];
  if (valid.length === 0) return false;
  return valid.some((d) => isWithinPeriod(d, period, asOfDate));
}

export function projectRelevantDates(project: Project): string[] {
  const dates: string[] = [];
  if (project.startDate) dates.push(project.startDate);
  if (project.endDate) dates.push(project.endDate);
  if (project.billing?.monthlyStartDate) dates.push(project.billing.monthlyStartDate);
  for (const payment of project.payments ?? []) {
    if (payment.date) dates.push(payment.date);
  }
  if (project.updatedAt) {
    dates.push(new Date(project.updatedAt).toISOString().slice(0, 10));
  }
  return dates;
}

export function projectPaymentDates(project: Project): string[] {
  return (project.payments ?? []).map((p) => p.date).filter(Boolean);
}
