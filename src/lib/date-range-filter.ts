import type { Project } from "@/lib/types";

export type PeriodKey = "all" | "1mo" | "2mo" | "4mo" | "6mo" | "1y";

/** Default — show all data until the user narrows the window. */
export const DEFAULT_PERIOD: PeriodKey = "all";

const PERIOD_MONTHS: Record<Exclude<PeriodKey, "all">, number> = {
  "1mo": 1,
  "2mo": 2,
  "4mo": 4,
  "6mo": 6,
  "1y": 12,
};

/** Month-based periods used across operations views. */
export const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "1mo", label: "1 month" },
  { value: "2mo", label: "2 months" },
  { value: "4mo", label: "4 months" },
  { value: "6mo", label: "6 months" },
  { value: "1y", label: "12 months" },
];

/** Analytics hub — same options as operations filters. */
export const ANALYTICS_PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = PERIOD_OPTIONS;

export function periodMonths(period: PeriodKey): number | null {
  if (period === "all") return null;
  return PERIOD_MONTHS[period];
}

export function periodLabel(period: PeriodKey): string {
  if (period === "all") return "All time";
  return PERIOD_OPTIONS.find((o) => o.value === period)?.label.toLowerCase() ?? "period";
}

/** Calendar date in the user's local timezone (YYYY-MM-DD). Avoids UTC drift in production. */
export function toLocalISODate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Normalize stored dates (ISO strings, timestamps) for safe comparison. */
export function normalizeDateString(raw: string | undefined | null): string | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = Date.parse(s);
  if (Number.isNaN(parsed)) return null;
  return toLocalISODate(new Date(parsed));
}

function subtractMonths(from: Date, months: number): Date {
  const result = new Date(from);
  const day = result.getDate();
  result.setMonth(result.getMonth() - months);
  if (result.getDate() !== day) result.setDate(0);
  return result;
}

export function periodBounds(
  period: PeriodKey,
  asOfDate?: string,
): { start: string; end: string } | null {
  if (period === "all") return null;

  const months = periodMonths(period);
  if (months == null) return null;

  const end = normalizeDateString(asOfDate) ?? toLocalISODate();
  const endDate = new Date(`${end}T12:00:00`);
  const startDate = subtractMonths(endDate, months);

  return { start: toLocalISODate(startDate), end };
}

export function isWithinPeriod(
  date: string | undefined | null,
  period: PeriodKey,
  asOfDate?: string,
): boolean {
  if (period === "all") return true;
  const d = normalizeDateString(date);
  if (!d) return false;
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
  const valid = dates.map((d) => normalizeDateString(d)).filter(Boolean) as string[];
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
  return dates;
}

export function projectPaymentDates(project: Project): string[] {
  return (project.payments ?? []).map((p) => p.date).filter(Boolean);
}
