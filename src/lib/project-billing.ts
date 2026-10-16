import { formatINRWhole } from "./invoice-calc";
import { totalReceived } from "./project-payments";
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
    contractValue: explicit?.contractValue,
    upfrontAmount: explicit?.upfrontAmount ?? parsed.upfrontAmount,
    maintenanceAmount: explicit?.maintenanceAmount ?? parsed.maintenanceAmount,
    maintenanceMonths: explicit?.maintenanceMonths ?? parsed.maintenanceMonths,
    monthlyAmount: explicit?.monthlyAmount ?? parsed.monthlyAmount,
    monthlyMonths: explicit?.monthlyMonths ?? parsed.monthlyMonths,
    monthlyStartDate: explicit?.monthlyStartDate ?? parsed.monthlyStartDate,
    monthlyEndDate: explicit?.monthlyEndDate,
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
  // Authoritative contract total (Ground Zero import) — monthly split is informational.
  if (billing.contractValue) {
    let label = `${formatINRWhole(billing.contractValue)} total`;
    if (billing.monthlyAmount) {
      label += ` (incl. ${formatINRWhole(billing.monthlyAmount)}/month${
        billing.monthlyMonths != null ? ` × ${billing.monthlyMonths}` : ""
      })`;
    } else if (billing.maintenanceAmount) {
      label += ` (incl. ${formatINRWhole(billing.maintenanceAmount)} maintenance${
        billing.maintenanceMonths != null ? ` for ${billing.maintenanceMonths} months` : ""
      })`;
    }
    return label;
  }

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
  if (billing.monthlyEndDate) parts.push(`closed ${billing.monthlyEndDate}`);
  return parts.length > 0 ? parts.join(" + ") : "—";
}

export function buildRevenueValueFromBilling(billing: ProjectBilling): string | undefined {
  const label = formatBillingLabel(billing);
  return label === "—" ? undefined : label;
}

export function recurringStatus(billing: ProjectBilling, asOfDate: string): RecurringBillingStatus {
  if (!billing.monthlyAmount) return "none";
  // Permanently closed retainers never come back as active or future.
  if (billing.monthlyEndDate && billing.monthlyEndDate <= asOfDate) return "ended";
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

/** True when the project still has a monthly retainer scheduled (active or not yet started). */
export function projectHasOpenRetainer(project: Project, asOfDate?: string): boolean {
  const asOf = asOfDate ?? new Date().toISOString().slice(0, 10);
  const status = recurringStatus(resolveProjectBilling(project), asOf);
  return status === "active" || status === "not_started";
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
  void asOfDate;
  if (!isRevenueProject(project.status)) return 0;
  const billing = resolveProjectBilling(project);

  // Prefer the Ground Zero locked total (received + outstanding) so Booked
  // never understates Outstanding — e.g. Rent Management 80k vs a stale 70k
  // contractValue left on the project after edits.
  let oneTime = 0;
  if (project.historicalOutstanding != null) {
    const locked = (project.historicalReceived ?? 0) + project.historicalOutstanding;
    if (locked > 0) oneTime = locked;
  }
  if (oneTime <= 0) {
    if (billing.contractValue) {
      oneTime = billing.contractValue;
    } else {
      oneTime = billing.upfrontAmount ?? 0;
      if (maintenanceCountsInBooked(billing)) {
        oneTime += billing.maintenanceAmount ?? 0;
      }
    }
  }

  if (billing.monthlyAmount) {
    // Recognize recurring revenue only as it is actually received. This keeps
    // future months out of Booked while making every received installment part
    // of Booked. For hybrid projects, only receipts above the already-booked
    // one-time amount add recurring revenue, preventing double counting.
    return Math.max(oneTime, totalReceived(project));
  }

  const minReceived = totalReceived(project);
  if (oneTime > 0) return Math.max(oneTime, minReceived);
  // Explicit form entries win over legacy revenueValue text — a typed 0 sticks unless payments were collected.
  if (
    billing.contractValue === 0 ||
    billing.upfrontAmount != null ||
    billing.maintenanceAmount != null
  ) {
    return minReceived;
  }

  const text = project.revenueValue?.trim() ?? "";
  if (!text || /partner|discount|tbd|—/i.test(text)) return minReceived;
  if (/\/\s*month/i.test(text) && !billing.upfrontAmount) return minReceived;

  return Math.max(parseFirstRupee(text) ?? 0, minReceived);
}

/** Full contract value including maintenance — for payment targets. */
export function computeTotalContractValue(project: Project, asOfDate: string): number {
  const billing = resolveProjectBilling(project);
  if (billing.contractValue) return billing.contractValue;
  if (billing.contractValue === 0) return 0;
  // Monthly retainers are recurring income only — never part of the
  // contract total (no months × rate accumulation).
  const total = (billing.upfrontAmount ?? 0) + (billing.maintenanceAmount ?? 0);

  if (total > 0) return total;
  // A monthly-only project has no contract receivable. Its collected
  // installments count in Revenue Booked, but never become contract value or
  // outstanding.
  if (billing.monthlyAmount) return 0;
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
  // Fixed-term retainers count as MRR while they run — recurringStatus
  // flips them to "ended" once the term completes.
  return billing.monthlyAmount ?? 0;
}

/**
 * Monthly rate (₹/month) of retainers that haven't started yet — the exact
 * mirror of activeMrr. Maintenance lump sums are contract totals, not rates,
 * so they never count here.
 */
export function futureMonthlyRevenue(project: Project, asOfDate: string): number {
  if (!isRevenueProject(project.status)) return 0;
  const billing = resolveProjectBilling(project);
  if (!billing.monthlyAmount) return 0;
  if (recurringStatus(billing, asOfDate) !== "not_started") return 0;
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
        received: totalReceived(project),
        // Received recurring installments are booked; future months remain in
        // MRR / future monthly only.
        countsInBooked: bookedRevenue > 0 || (hasUpfront && isRevenueProject(project.status)),
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
      billingLabel:
        r.billing.monthlyAmount &&
        !r.billing.contractValue &&
        !(r.billing.upfrontAmount || r.billing.maintenanceAmount)
          ? `${formatINRWhole(r.received)} recurring revenue received to date`
          : formatBookedRevenueLabel(r.billing),
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
    .map((project): FutureMonthlyRow | null => {
      const amount = futureMonthlyRevenue(project, asOf);
      if (amount <= 0) return null;
      const billing = resolveProjectBilling(project);

      const schedule = formatUnstartedMonthlySchedule(billing);
      const scheduleLabel = schedule.scheduleLabel;
      const termKind = schedule.termKind;
      const amountSubtext = futureMonthlyAmountSubtext(billing, amount, termKind);

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
    billing.contractValue != null ||
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
