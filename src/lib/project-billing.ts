import { formatINRWhole } from "./invoice-calc";
import { sumProjectPayments } from "./project-payments";
import { isRevenueProject, projectClientLabel } from "./project-status";
import type { Project, ProjectBilling } from "./types";

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

  // Standalone flat fee, e.g. "₹20,000 for 3 months"
  if (!text.includes("+") && !/\/\s*month/i.test(text)) {
    const flatForMonths = text.match(/for\s+(\d+)\s*months?/i);
    if (flatForMonths) {
      const amt = parseKAmount(text) ?? parseFirstRupee(text);
      if (amt != null) {
        return {
          maintenanceAmount: amt,
          maintenanceMonths: Number(flatForMonths[1]),
        };
      }
    }
  }

  const monthlyOnly = text.match(/₹?\s*([\d,]+(?:\.\d+)?)\s*\/?\s*month/i);
  if (monthlyOnly && !text.includes("+")) {
    const amt = parseKAmount(text) ?? parseFirstRupee(text);
    const monthsMatch = text.match(/(?:for|x|×)\s*(\d+)\s*months?/i);
    return {
      monthlyAmount: amt ?? undefined,
      monthlyMonths: monthsMatch ? Number(monthsMatch[1]) : undefined,
    };
  }

  const upfront = parseFirstRupee(text);
  const monthly = parseSecondAmount(text);
  const monthsMatch = text.match(/(?:for|x|×)\s*(\d+)\s*months?/i);
  const monthsXMatch = text.match(/[xX×]\s*(\d+)/);

  const maintMatch = text.match(
    /₹?\s*([\d,]+(?:\.\d+)?)\s*[kK]?\s+maintenance(?:\s*\((\d+)\s*months?\))?/i,
  );
  const afterPlus = text.includes("+") ? text.split("+").slice(1).join("+").trim() : "";
  const forMonthsLump =
    afterPlus && !/\/\s*month/i.test(afterPlus)
      ? afterPlus.match(/₹?\s*([\d,]+(?:\.\d+)?)\s*[kK]?\s+for\s+(\d+)\s*months?/i)
      : null;

  const billing: ProjectBilling = {};
  if (upfront != null && !text.toLowerCase().includes("/month")) billing.upfrontAmount = upfront;

  if (maintMatch) {
    const amt = parseKAmount(maintMatch[0]) ?? parseFirstRupee(maintMatch[0]);
    if (amt != null) billing.maintenanceAmount = amt;
    if (maintMatch[2]) billing.maintenanceMonths = Number(maintMatch[2]);
  } else if (forMonthsLump && upfront != null) {
    // Hybrid: "₹60,000 + ₹7K for 2 months" → ₹7k/month × 2
    const amt = parseKAmount(forMonthsLump[0]) ?? parseFirstRupee(forMonthsLump[0]);
    if (amt != null) {
      billing.monthlyAmount = amt;
      billing.monthlyMonths = Number(forMonthsLump[2]);
    }
  } else if (forMonthsLump) {
    const amt = parseKAmount(forMonthsLump[0]) ?? parseFirstRupee(forMonthsLump[0]);
    if (amt != null) billing.maintenanceAmount = amt;
    billing.maintenanceMonths = Number(forMonthsLump[2]);
  } else if (monthly != null) {
    billing.monthlyAmount = monthly;
    if (monthsMatch) billing.monthlyMonths = Number(monthsMatch[1]);
    else if (monthsXMatch) billing.monthlyMonths = Number(monthsXMatch[1]);
  }

  return billing;
}

export function resolveProjectBilling(project: Project): ProjectBilling {
  const explicit = project.billing;
  const parsed = parseBillingFromRevenueValue(project.revenueValue);
  const merged: ProjectBilling = {
    upfrontAmount: explicit?.upfrontAmount ?? parsed.upfrontAmount,
    maintenanceAmount: explicit?.maintenanceAmount ?? parsed.maintenanceAmount,
    maintenanceMonths: explicit?.maintenanceMonths ?? parsed.maintenanceMonths,
    monthlyAmount: explicit?.monthlyAmount ?? parsed.monthlyAmount,
    monthlyMonths: explicit?.monthlyMonths ?? parsed.monthlyMonths,
    monthlyStartDate: explicit?.monthlyStartDate ?? parsed.monthlyStartDate,
  };
  return normalizeBilling(merged, project);
}

/** Resolve conflicting legacy shapes and known project corrections. */
function normalizeBilling(billing: ProjectBilling, project: Project): ProjectBilling {
  let b: ProjectBilling = { ...billing };

  // Hybrid project + per-month fixed term — never both maintenance and monthly
  if (b.maintenanceAmount && b.monthlyAmount && b.upfrontAmount) {
    const { maintenanceAmount: _m, maintenanceMonths: _mm, ...rest } = b;
    b = rest;
  }

  // Dev: ₹60k project + ₹7k/month × 2 maintenance — maintenance excluded from revenue booked
  if (
    b.upfrontAmount === 60_000 &&
    b.monthlyAmount === 7_000 &&
    b.monthlyMonths === 2 &&
    !b.maintenanceAmount
  ) {
    return {
      upfrontAmount: 60_000,
      maintenanceAmount: 14_000,
      maintenanceMonths: 2,
    };
  }

  // k h kiran: ₹20k total for 3 months — not ₹20k/month × 3
  if (
    !b.upfrontAmount &&
    b.monthlyAmount === 20_000 &&
    b.monthlyMonths === 3 &&
    !b.maintenanceAmount
  ) {
    return { maintenanceAmount: 20_000, maintenanceMonths: 3 };
  }

  return b;
}

export function formatBillingLabel(billing: ProjectBilling): string {
  const parts: string[] = [];
  const hasMaintenance = (billing.maintenanceAmount ?? 0) > 0;
  const hasMonthly = (billing.monthlyAmount ?? 0) > 0;

  if (billing.upfrontAmount) {
    parts.push(
      hasMaintenance || hasMonthly
        ? `${formatINRWhole(billing.upfrontAmount)} project`
        : formatINRWhole(billing.upfrontAmount),
    );
  }
  if (billing.maintenanceAmount) {
    if (
      billing.maintenanceMonths != null &&
      billing.maintenanceMonths > 0 &&
      billing.maintenanceAmount % billing.maintenanceMonths === 0
    ) {
      const perMonth = billing.maintenanceAmount / billing.maintenanceMonths;
      parts.push(
        `${formatINRWhole(perMonth)}/month maintenance for ${billing.maintenanceMonths} months`,
      );
    } else {
      let m = `${formatINRWhole(billing.maintenanceAmount)} maintenance`;
      if (billing.maintenanceMonths != null) m += ` for ${billing.maintenanceMonths} months`;
      parts.push(m);
    }
  }
  if (billing.monthlyAmount) {
    let m = `${formatINRWhole(billing.monthlyAmount)}/month`;
    if (billing.monthlyMonths != null) m += ` for ${billing.monthlyMonths} months`;
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

export function formatBookedRevenueLabel(billing: ProjectBilling): string {
  if ((billing.upfrontAmount ?? 0) > 0 && (billing.maintenanceAmount ?? 0) > 0) {
    return `${formatINRWhole(billing.upfrontAmount!)} project`;
  }
  return formatBillingLabel(billing);
}

function maintenanceCountsInBooked(billing: ProjectBilling): boolean {
  return (billing.maintenanceAmount ?? 0) > 0 && !(billing.upfrontAmount ?? 0);
}

export function computeBookedRevenue(project: Project, asOfDate: string): number {
  if (!isRevenueProject(project.status)) return 0;
  const billing = resolveProjectBilling(project);
  let total = billing.upfrontAmount ?? 0;

  if (maintenanceCountsInBooked(billing)) {
    total += billing.maintenanceAmount ?? 0;
  }

  if (billing.monthlyAmount) {
    if (billing.monthlyMonths != null) {
      total += billing.monthlyAmount * billing.monthlyMonths;
    } else {
      const status = recurringStatus(billing, asOfDate);
      if (status === "active" || status === "ended") {
        // Ongoing retainer already started — upfront only in booked; MRR tracked separately
      }
      // Ongoing not started → future monthly pipeline only
    }
  }

  if (total > 0) return total;

  const text = project.revenueValue?.trim() ?? "";
  if (!text || /partner|discount|tbd|—/i.test(text)) return 0;
  if (/\/\s*month/i.test(text) && !billing.upfrontAmount) return 0;

  const oneTime = parseFirstRupee(text);
  return oneTime ?? 0;
}

/** Full contract value including maintenance — for payment targets. */
export function computeTotalContractValue(project: Project, asOfDate: string): number {
  const billing = resolveProjectBilling(project);
  let total = billing.upfrontAmount ?? 0;
  total += billing.maintenanceAmount ?? 0;

  if (billing.monthlyAmount && billing.monthlyMonths != null) {
    total += billing.monthlyAmount * billing.monthlyMonths;
  } else if (billing.monthlyAmount) {
    const status = recurringStatus(billing, asOfDate);
    if (status === "active" || status === "ended") {
      // Ongoing — contract total unknown; upfront + maintenance only
    }
  }

  if (total > 0) return total;
  return computeBookedRevenue(project, asOfDate);
}

/** Full contract value for a revenue project (includes maintenance). */
export function projectContractValue(project: Project, asOfDate?: string): number {
  const asOf = asOfDate ?? new Date().toISOString().slice(0, 10);
  return computeTotalContractValue(project, asOf);
}

export function activeMrr(project: Project, asOfDate: string): number {
  const billing = resolveProjectBilling(project);
  if (!isRevenueProject(project.status)) return 0;
  if (recurringStatus(billing, asOfDate) !== "active") return 0;
  if (billing.monthlyMonths != null) return 0;
  return billing.monthlyAmount ?? 0;
}

export function futureMonthlyRevenue(project: Project, asOfDate: string): number {
  if (!isRevenueProject(project.status)) return 0;
  const billing = resolveProjectBilling(project);

  // Hybrid maintenance (excluded from booked) — tracked as future monthly
  if ((billing.maintenanceAmount ?? 0) > 0 && (billing.upfrontAmount ?? 0) > 0) {
    return billing.maintenanceAmount ?? 0;
  }

  if (!billing.monthlyAmount) return 0;
  // Fixed-term contracts without upfront maintenance are in revenue booked
  if (billing.monthlyMonths != null) return 0;
  const status = recurringStatus(billing, asOfDate);
  if (status !== "not_started") return 0;
  return billing.monthlyAmount;
}

export function projectBillingRows(projects: Project[], asOfDate?: string): ProjectBillingRow[] {
  const asOf = asOfDate ?? new Date().toISOString().slice(0, 10);
  return projects
    .filter((p) => isRevenueProject(p.status))
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
        billingLabel: formatBookedRevenueLabel(billing),
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
          (hasUpfront && isRevenueProject(project.status)) ||
          (hasMonthly && billing.monthlyMonths != null && isRevenueProject(project.status)),
      };
    })
    .sort((a, b) => a.client.localeCompare(b.client));
}

export function sumBookedProjectRevenue(projects: Project[], asOfDate?: string): number {
  const asOf = asOfDate ?? new Date().toISOString().slice(0, 10);
  return projects.reduce((s, p) => s + computeBookedRevenue(p, asOf), 0);
}

/** Revenue pipeline — ongoing and done projects only. */
export function sumPipelineBookedRevenue(projects: Project[], asOfDate?: string): number {
  return sumBookedProjectRevenue(
    projects.filter((p) => isRevenueProject(p.status)),
    asOfDate,
  );
}

/** @deprecated Use sumPipelineBookedRevenue */
export function sumActivePipelineBooked(projects: Project[], asOfDate?: string): number {
  return sumPipelineBookedRevenue(projects, asOfDate);
}

export function sumActiveMrr(projects: Project[], asOfDate?: string): number {
  const asOf = asOfDate ?? new Date().toISOString().slice(0, 10);
  return projects.reduce((s, p) => s + activeMrr(p, asOf), 0);
}

export function sumFutureMonthlyPipeline(projects: Project[], asOfDate?: string): number {
  const asOf = asOfDate ?? new Date().toISOString().slice(0, 10);
  return projects.reduce((s, p) => s + futureMonthlyRevenue(p, asOf), 0);
}

export type BookedRevenueRow = {
  client: string;
  projectType?: string;
  amount: number;
  billingLabel: string;
};

export function bookedRevenueBreakdown(projects: Project[], asOfDate?: string): BookedRevenueRow[] {
  return projectBillingRows(projects, asOfDate)
    .filter((r) => r.bookedRevenue > 0)
    .map((r) => ({
      client: r.client,
      projectType: r.project.projectType,
      amount: r.bookedRevenue,
      billingLabel: formatBookedRevenueLabel(r.billing),
    }));
}

export type ActiveMrrRow = {
  client: string;
  projectType?: string;
  amount: number;
  billingLabel: string;
};

export function activeMrrBreakdown(projects: Project[], asOfDate?: string): ActiveMrrRow[] {
  return projectBillingRows(projects, asOfDate)
    .filter((r) => r.activeMrr > 0)
    .map((r) => ({
      client: r.client,
      projectType: r.project.projectType,
      amount: r.activeMrr,
      billingLabel: formatBookedRevenueLabel(r.billing),
    }));
}

export type FutureMonthlyTermKind = "fixed" | "ongoing";

/** Label for unstarted monthly only — excludes upfront (hybrid projects). */
export function formatUnstartedMonthlySchedule(billing: ProjectBilling): {
  scheduleLabel: string;
  termKind: FutureMonthlyTermKind;
  perMonth: number;
  months: number | null;
  upfrontNote?: string;
} {
  const perMonth = billing.monthlyAmount ?? 0;
  if (billing.monthlyMonths != null) {
    return {
      scheduleLabel: `${formatINRWhole(perMonth)}/month for ${billing.monthlyMonths} months`,
      termKind: "fixed",
      perMonth,
      months: billing.monthlyMonths,
    };
  }
  return {
    scheduleLabel: `${formatINRWhole(perMonth)}/month (ongoing retainer)`,
    termKind: "ongoing",
    perMonth,
    months: null,
  };
}

export function futureMonthlyAmountSubtext(
  billing: ProjectBilling,
  amount: number,
  termKind: FutureMonthlyTermKind,
): string {
  if (termKind === "fixed" && billing.monthlyMonths != null && billing.monthlyAmount) {
    return `${formatINRWhole(amount)} total (${formatINRWhole(billing.monthlyAmount)} × ${billing.monthlyMonths})`;
  }
  if (termKind === "ongoing") {
    return `${formatINRWhole(amount)}/month once started`;
  }
  return formatINRWhole(amount);
}

export type FutureMonthlyRow = {
  client: string;
  projectType?: string;
  amount: number;
  /** Monthly schedule only — no upfront mixed in. */
  scheduleLabel: string;
  amountSubtext: string;
  termKind: FutureMonthlyTermKind;
  upfrontNote?: string;
};

export function futureMonthlyBreakdown(projects: Project[], asOfDate?: string): FutureMonthlyRow[] {
  const asOf = asOfDate ?? new Date().toISOString().slice(0, 10);
  return projects
    .filter((p) => isRevenueProject(p.status))
    .map((project) => {
      const amount = futureMonthlyRevenue(project, asOf);
      if (amount <= 0) return null;
      const billing = resolveProjectBilling(project);

      const isHybridMaintenance =
        (billing.maintenanceAmount ?? 0) > 0 &&
        (billing.upfrontAmount ?? 0) > 0 &&
        !(billing.monthlyAmount ?? 0);

      let scheduleLabel: string;
      let termKind: FutureMonthlyTermKind;
      let amountSubtext: string;

      if (isHybridMaintenance) {
        if (
          billing.maintenanceMonths != null &&
          billing.maintenanceMonths > 0 &&
          billing.maintenanceAmount! % billing.maintenanceMonths === 0
        ) {
          const perMonth = billing.maintenanceAmount! / billing.maintenanceMonths;
          scheduleLabel = `${formatINRWhole(perMonth)}/month maintenance for ${billing.maintenanceMonths} months`;
          termKind = "fixed";
          amountSubtext = `${formatINRWhole(amount)} total (${formatINRWhole(perMonth)} × ${billing.maintenanceMonths})`;
        } else {
          scheduleLabel = `${formatINRWhole(billing.maintenanceAmount!)} maintenance`;
          if (billing.maintenanceMonths != null) {
            scheduleLabel += ` for ${billing.maintenanceMonths} months`;
          }
          termKind = "fixed";
          amountSubtext = formatINRWhole(amount);
        }
      } else {
        const schedule = formatUnstartedMonthlySchedule(billing);
        scheduleLabel = schedule.scheduleLabel;
        termKind = schedule.termKind;
        amountSubtext = futureMonthlyAmountSubtext(billing, amount, termKind);
      }

      const upfrontNote =
        (billing.upfrontAmount ?? 0) > 0
          ? `Upfront ${formatINRWhole(billing.upfrontAmount!)} is separate — already in revenue booked`
          : undefined;
      return {
        client: projectClientLabel(project),
        projectType: project.projectType,
        amount,
        scheduleLabel,
        amountSubtext,
        termKind,
        upfrontNote,
      };
    })
    .filter((r): r is FutureMonthlyRow => r != null)
    .sort((a, b) => b.amount - a.amount || a.client.localeCompare(b.client));
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
  const billing = resolveProjectBilling(project);
  const hasBilling =
    billing.upfrontAmount != null ||
    billing.maintenanceAmount != null ||
    billing.monthlyAmount != null ||
    billing.monthlyStartDate != null;
  if (!hasBilling) return project;
  return {
    ...project,
    billing,
    revenueValue: buildRevenueValueFromBilling(billing) ?? project.revenueValue,
  };
}

export function mergeAllProjectBilling(projects: Project[]): Project[] {
  return projects.map(mergeProjectBilling);
}
