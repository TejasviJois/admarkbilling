import { formatINRWhole } from "./invoice-calc";
import { sumProjectPayments } from "./project-payments";
import { projectClientLabel } from "./project-status";
import type { Project, ProjectBilling, ProjectStatus } from "./types";

const BOOKED_STATUSES: ProjectStatus[] = ["active", "planning"];

export type RecurringBillingStatus = "none" | "not_started" | "active" | "ended";

export type ProjectBillingRow = {
  project: Project;
  client: string;
  billing: ProjectBilling;
  billingLabel: string;
  upfront: number | null;
  monthly: number | null;
  monthlyMonths: number | null;
  monthlyStartDate?: string;
  recurringStatus: RecurringBillingStatus;
  /** Counts toward total revenue booked (upfront + started fixed-term monthly). */
  bookedRevenue: number;
  /** Monthly retainer once started — shown separately from booked total. */
  activeMrr: number;
  received: number;
  countsInBooked: boolean;
};

function parseKAmount(text: string): number | null {
  const k = text.match(/₹?\s*([\d,]+(?:\.\d+)?)\s*[kK]/);
  if (!k) return null;
  const n = Number(k[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n * 1000 : null;
}

function parseFirstRupee(text: string): number | null {
  const m = text.match(/₹\s*([\d,]+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseSecondAmount(text: string): number | null {
  const afterPlus = text.split("+")[1];
  if (!afterPlus) return null;
  return parseKAmount(afterPlus) ?? parseFirstRupee(afterPlus);
}

/** Best-effort parse of legacy `revenueValue` text into structured billing. */
export function parseBillingFromRevenueValue(revenueValue: string | undefined): ProjectBilling {
  if (!revenueValue?.trim()) return {};
  const text = revenueValue.trim();
  if (/partner|discount|tbd|—/i.test(text)) return {};

  const monthlyOnly = text.match(/₹?\s*([\d,]+(?:\.\d+)?)\s*\/?\s*month/i);
  if (monthlyOnly && !text.includes("+")) {
    const amt = parseKAmount(text) ?? parseFirstRupee(text);
    const monthsMatch = text.match(/[xX×]\s*(\d+)/);
    return {
      monthlyAmount: amt ?? undefined,
      monthlyMonths: monthsMatch ? Number(monthsMatch[1]) : undefined,
    };
  }

  const upfront = parseFirstRupee(text);
  const monthly = parseSecondAmount(text);
  const monthsMatch = text.match(/(?:for|x|×)\s*(\d+)\s*months?/i);
  const monthsXMatch = text.match(/[xX×]\s*(\d+)/);

  const billing: ProjectBilling = {};
  if (upfront != null && !text.toLowerCase().includes("/month")) billing.upfrontAmount = upfront;
  if (monthly != null) billing.monthlyAmount = monthly;
  if (monthsMatch) billing.monthlyMonths = Number(monthsMatch[1]);
  else if (monthsXMatch && monthly != null) billing.monthlyMonths = Number(monthsXMatch[1]);

  return billing;
}

export function resolveProjectBilling(project: Project): ProjectBilling {
  const explicit = project.billing;
  const parsed = parseBillingFromRevenueValue(project.revenueValue);
  return {
    upfrontAmount: explicit?.upfrontAmount ?? parsed.upfrontAmount,
    monthlyAmount: explicit?.monthlyAmount ?? parsed.monthlyAmount,
    monthlyMonths: explicit?.monthlyMonths ?? parsed.monthlyMonths,
    monthlyStartDate: explicit?.monthlyStartDate ?? parsed.monthlyStartDate,
  };
}

export function formatBillingLabel(billing: ProjectBilling): string {
  const parts: string[] = [];
  if (billing.upfrontAmount) parts.push(formatINRWhole(billing.upfrontAmount));
  if (billing.monthlyAmount) {
    let m = `${formatINRWhole(billing.monthlyAmount)}/month`;
    if (billing.monthlyMonths) m += ` × ${billing.monthlyMonths}`;
    else m += " (ongoing)";
    parts.push(m);
  }
  if (billing.monthlyStartDate) parts.push(`starts ${billing.monthlyStartDate}`);
  return parts.length > 0 ? parts.join(" + ") : "—";
}

export function buildRevenueValueFromBilling(billing: ProjectBilling): string | undefined {
  const label = formatBillingLabel(billing);
  return label === "—" ? undefined : label;
}

export function recurringStatus(
  billing: ProjectBilling,
  asOfDate: string,
): RecurringBillingStatus {
  if (!billing.monthlyAmount) return "none";
  if (!billing.monthlyStartDate) return "not_started";
  if (billing.monthlyStartDate > asOfDate) return "not_started";

  if (billing.monthlyMonths != null) {
    const start = new Date(`${billing.monthlyStartDate}T12:00:00`);
    const asOf = new Date(`${asOfDate}T12:00:00`);
    const monthsElapsed =
      (asOf.getFullYear() - start.getFullYear()) * 12 + (asOf.getMonth() - start.getMonth());
    if (monthsElapsed >= billing.monthlyMonths) return "ended";
  }
  return "active";
}

export function computeBookedRevenue(project: Project, asOfDate: string): number {
  if (!BOOKED_STATUSES.includes(project.status)) return 0;
  const billing = resolveProjectBilling(project);
  let total = billing.upfrontAmount ?? 0;

  const status = recurringStatus(billing, asOfDate);
  if (billing.monthlyAmount && status === "active") {
    if (billing.monthlyMonths != null) {
      total += billing.monthlyAmount * billing.monthlyMonths;
    }
  } else if (billing.monthlyAmount && status === "ended" && billing.monthlyMonths != null) {
    total += billing.monthlyAmount * billing.monthlyMonths;
  }

  return total;
}

export function activeMrr(project: Project, asOfDate: string): number {
  const billing = resolveProjectBilling(project);
  if (!BOOKED_STATUSES.includes(project.status)) return 0;
  if (recurringStatus(billing, asOfDate) !== "active") return 0;
  if (billing.monthlyMonths != null) return 0;
  return billing.monthlyAmount ?? 0;
}

export function futureMonthlyRevenue(project: Project, asOfDate: string): number {
  if (!BOOKED_STATUSES.includes(project.status)) return 0;
  const billing = resolveProjectBilling(project);
  if (!billing.monthlyAmount) return 0;
  const status = recurringStatus(billing, asOfDate);
  if (status !== "not_started") return 0;
  if (billing.monthlyMonths != null) return billing.monthlyAmount * billing.monthlyMonths;
  return billing.monthlyAmount;
}

export function projectBillingRows(projects: Project[], asOfDate?: string): ProjectBillingRow[] {
  const asOf = asOfDate ?? new Date().toISOString().slice(0, 10);
  return projects
    .filter((p) => BOOKED_STATUSES.includes(p.status))
    .map((project) => {
      const billing = resolveProjectBilling(project);
      const bookedRevenue = computeBookedRevenue(project, asOf);
      const mrr = activeMrr(project, asOf);
      const hasUpfront = (billing.upfrontAmount ?? 0) > 0;
      const hasMonthly = (billing.monthlyAmount ?? 0) > 0;
      const status = recurringStatus(billing, asOf);

      return {
        project,
        client: projectClientLabel(project),
        billing,
        billingLabel: formatBillingLabel(billing),
        upfront: billing.upfrontAmount ?? null,
        monthly: billing.monthlyAmount ?? null,
        monthlyMonths: billing.monthlyMonths ?? null,
        monthlyStartDate: billing.monthlyStartDate,
        recurringStatus: status,
        bookedRevenue,
        activeMrr: mrr,
        received: sumProjectPayments(project.payments),
        countsInBooked:
          bookedRevenue > 0 ||
          (hasUpfront && BOOKED_STATUSES.includes(project.status)) ||
          (hasMonthly && status === "active" && billing.monthlyMonths != null),
      };
    })
    .sort((a, b) => a.client.localeCompare(b.client));
}

export function sumBookedProjectRevenue(projects: Project[], asOfDate?: string): number {
  const asOf = asOfDate ?? new Date().toISOString().slice(0, 10);
  return projects.reduce((s, p) => s + computeBookedRevenue(p, asOf), 0);
}

export function sumActiveMrr(projects: Project[], asOfDate?: string): number {
  const asOf = asOfDate ?? new Date().toISOString().slice(0, 10);
  return projects.reduce((s, p) => s + activeMrr(p, asOf), 0);
}

export function sumFutureMonthlyPipeline(projects: Project[], asOfDate?: string): number {
  const asOf = asOfDate ?? new Date().toISOString().slice(0, 10);
  return projects.reduce((s, p) => s + futureMonthlyRevenue(p, asOf), 0);
}

export function recurringStatusLabel(status: RecurringBillingStatus): string {
  switch (status) {
    case "none":
      return "One-time only";
    case "not_started":
      return "Monthly not started";
    case "active":
      return "Monthly active";
    case "ended":
      return "Monthly complete";
  }
}

export function mergeProjectBilling(project: Project): Project {
  if (project.billing) {
    return {
      ...project,
      revenueValue: buildRevenueValueFromBilling(project.billing) ?? project.revenueValue,
    };
  }
  const parsed = parseBillingFromRevenueValue(project.revenueValue);
  const hasParsed = parsed.upfrontAmount != null || parsed.monthlyAmount != null;
  if (!hasParsed) return project;
  return {
    ...project,
    billing: parsed,
    revenueValue: buildRevenueValueFromBilling(parsed) ?? project.revenueValue,
  };
}

export function mergeAllProjectBilling(projects: Project[]): Project[] {
  return projects.map(mergeProjectBilling);
}
