import type { Project } from "@/lib/types";

export type PeriodKey = "all" | "1mo" | "2mo" | "3mo" | "4mo" | "6mo" | "1y";

/** Default — show all data until the user narrows the window. */
export const DEFAULT_PERIOD: PeriodKey = "all";

const PERIOD_MONTHS: Record<Exclude<PeriodKey, "all">, number> = {
  "1mo": 1,
  "2mo": 2,
  "3mo": 3,
  "4mo": 4,
  "6mo": 6,
  "1y": 12,
};

/** Month-based periods used across operations views. */
export const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "1mo", label: "1 month" },
  { value: "2mo", label: "2 months" },
  { value: "3mo", label: "3 months" },
  { value: "4mo", label: "4 months" },
  { value: "6mo", label: "6 months" },
  { value: "1y", label: "12 months" },
];

/** Analytics hub — All time, rolling windows, then drill into a calendar month in the UI. */
export const ANALYTICS_RANGE_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "3mo", label: "3 months" },
  { value: "6mo", label: "6 months" },
];

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

/** YYYY-MM for a calendar date. */
export function calendarMonthKey(date: string | Date = toLocalISODate()): string {
  if (typeof date === "string") {
    const normalized = normalizeDateString(date);
    return (normalized ?? toLocalISODate()).slice(0, 7);
  }
  return toLocalISODate(date).slice(0, 7);
}

export function isInCalendarMonth(date: string | undefined | null, month: string): boolean {
  const normalized = normalizeDateString(date);
  return Boolean(normalized && normalized.startsWith(month));
}

export function formatCalendarMonthLabel(month: string): string {
  const parsed = new Date(`${month}-01T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return month;
  return parsed.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

/** Inclusive YYYY-MM list from start through end (each YYYY-MM). */
export function monthsThrough(startMonth: string, endMonth: string): string[] {
  const months: string[] = [];
  let year = Number(startMonth.slice(0, 4));
  let month = Number(startMonth.slice(5, 7));
  const endYear = Number(endMonth.slice(0, 4));
  const endMonthNum = Number(endMonth.slice(5, 7));
  if (!year || !month || !endYear || !endMonthNum) return [endMonth];
  while (year < endYear || (year === endYear && month <= endMonthNum)) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months.length ? months : [endMonth];
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

/** Monday of the week that contains `date` (YYYY-MM-DD), local calendar. */
export function isoWeekStart(date: string | undefined | null): string | null {
  const normalized = normalizeDateString(date);
  if (!normalized) return null;
  const d = new Date(`${normalized}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return toLocalISODate(d);
}

export function isoWeekEnd(weekStart: string): string | null {
  const start = normalizeDateString(weekStart);
  if (!start) return null;
  const d = new Date(`${start}T12:00:00`);
  d.setDate(d.getDate() + 6);
  return toLocalISODate(d);
}

/** True when Mon–Sun of `weekStart` overlaps the YYYY-MM calendar month. */
export function weekOverlapsCalendarMonth(weekStart: string, month: string): boolean {
  const start = normalizeDateString(weekStart);
  const end = isoWeekEnd(weekStart);
  if (!start || !end || !/^\d{4}-\d{2}$/.test(month)) return false;
  const [year, monthNum] = month.split("-").map(Number);
  const monthStart = `${month}-01`;
  const lastDay = new Date(year, monthNum, 0).getDate();
  const monthEnd = `${month}-${String(lastDay).padStart(2, "0")}`;
  return start <= monthEnd && end >= monthStart;
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
