import type { Project } from "@/lib/types";

export type PeriodKey = "all" | "5d" | "10d" | "30d" | "3mo" | "6mo" | "1y";

/** Default time window for list filters across the app. */
export const DEFAULT_PERIOD: PeriodKey = "5d";

export const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "5d", label: "5 days" },
  { value: "10d", label: "10 days" },
  { value: "30d", label: "30 days" },
  { value: "3mo", label: "3 months" },
  { value: "6mo", label: "6 months" },
  { value: "1y", label: "1 year" },
];

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
    case "5d":
      startDate.setDate(startDate.getDate() - 5);
      break;
    case "10d":
      startDate.setDate(startDate.getDate() - 10);
      break;
    case "30d":
      startDate.setDate(startDate.getDate() - 30);
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
