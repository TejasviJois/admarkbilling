import { formatINRWhole } from "./invoice-calc";
import { projectClientLabel } from "./project-status";
import {
  projectBillingRows,
  sumActiveMrr,
  sumActivePipelineBooked,
  sumFutureMonthlyPipeline,
  sumPipelineBookedRevenue,
} from "./project-billing";
import {
  isVerifiedPayment,
  resolvePaymentProof,
  sumProjectPayments,
} from "./project-payments";
import type { OperationsData, Project, ProjectPayment } from "./types";
import {
  buildMoneyOutRows,
  computeFinancialSummary,
  EXPENSE_CATEGORY_DESCRIPTIONS,
  EXPENSE_CATEGORY_SHORT_LABELS,
  normalizeCategory,
  type ExpenseCategory,
  type FinancialSummary,
} from "./financial";
import { isWithinPeriod, periodBounds, type PeriodKey } from "./date-range-filter";
import { proratedFixedMonthlyForPeriod } from "./fixed-monthly-expenses";

export type IncomeRow = {
  id: string;
  projectId: string;
  client: string;
  amount: number;
  date: string;
  note?: string;
  hasProof: boolean;
  proofImageUrl?: string;
};

export type RevenueRow = {
  project: Project;
  client: string;
  contract: number | null;
  contractLabel: string;
  received: number;
  pending: number | null;
  recurringStatus?: string;
  monthlyStartDate?: string;
};

export function sumAllProjectIncome(projects: Project[]): number {
  return projects.reduce((total, project) => total + sumProjectPayments(project.payments), 0);
}

/** Booked contract value — upfront + started fixed-term monthly only. Excludes unstarted retainers. */
/** @deprecated Use sumPipelineBookedRevenue or financial.activePipelineBooked */
export function sumOngoingProjectRevenue(projects: Project[]): number {
  return sumPipelineBookedRevenue(projects);
}

export { sumActiveMrr, sumFutureMonthlyPipeline, sumActivePipelineBooked, sumPipelineBookedRevenue, projectBillingRows };

export function allProjectPaymentsByMonth(projects: Project[]): Map<string, number> {
  const months = new Map<string, number>();
  for (const project of projects) {
    for (const payment of project.payments ?? []) {
      const key = payment.date.slice(0, 7);
      if (key.length !== 7) continue;
      months.set(key, (months.get(key) ?? 0) + (payment.amount || 0));
    }
  }
  return months;
}

export function flattenProjectIncome(projects: Project[]): IncomeRow[] {
  const rows: IncomeRow[] = [];
  for (const project of projects) {
    const client = projectClientLabel(project);
    for (const payment of project.payments ?? []) {
      const proof = resolvePaymentProof(project, payment);
      const proofImageUrl = proof?.imageDataUrl;
      rows.push({
        id: payment.id,
        projectId: project.id,
        client,
        amount: payment.amount,
        date: payment.date,
        note: payment.note,
        hasProof: Boolean(proofImageUrl),
        proofImageUrl,
      });
    }
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

export function ongoingRevenueRows(projects: Project[]): RevenueRow[] {
  return projectBillingRows(projects).map((row) => ({
    project: row.project,
    client: row.client,
    contract: row.bookedRevenue > 0 ? row.bookedRevenue : null,
    contractLabel: row.billingLabel,
    received: row.received,
    pending:
      row.bookedRevenue > 0 && row.received < row.bookedRevenue
        ? row.bookedRevenue - row.received
        : null,
    recurringStatus: row.recurringStatus,
    monthlyStartDate: row.monthlyStartDate,
  }));
}

export type CategoryAmountRow = {
  key: string;
  label: string;
  amount: number;
  hint?: string;
};

export function buildIncomeByClient(projects: Project[]): CategoryAmountRow[] {
  const totals = new Map<string, number>();
  for (const row of flattenProjectIncome(projects)) {
    totals.set(row.client, (totals.get(row.client) ?? 0) + row.amount);
  }
  return [...totals.entries()]
    .map(([client, amount]) => ({ key: client, label: client, amount }))
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
}

export function buildIncomeSourceBreakdown(financial: FinancialSummary): CategoryAmountRow[] {
  const rows: CategoryAmountRow[] = [
    {
      key: "baseline",
      label: "Baseline (through reconciliation)",
      amount: financial.baseline.totalRevenueReceived,
      hint: `As of ${financial.baseline.asOfDate}`,
    },
  ];
  if (financial.newRevenueAfterBaseline > 0) {
    rows.push({
      key: "new-payments",
      label: "New project payments",
      amount: financial.newRevenueAfterBaseline,
      hint: "Logged after baseline date",
    });
  }
  return rows.filter((r) => r.amount > 0);
}

export function buildMoneyOutCategoryBreakdown(ops: OperationsData): CategoryAmountRow[] {
  const financial = computeFinancialSummary(ops);
  const moneyOut = buildMoneyOutRows(financial, ops.expenses).map((row) => ({
    key: row.category,
    label: row.label,
    amount: row.amount,
    hint: EXPENSE_CATEGORY_DESCRIPTIONS[row.category],
    newEntryCount: row.newEntryCount,
  }));

  const rows: CategoryAmountRow[] = moneyOut.map(({ newEntryCount: _n, ...row }) => row);

  if (financial.totalHandoutsTaken > 0) {
    rows.push({
      key: "handout",
      label: EXPENSE_CATEGORY_SHORT_LABELS.handout,
      amount: financial.totalHandoutsTaken,
      hint: EXPENSE_CATEGORY_DESCRIPTIONS.handout,
    });
  }

  return rows.sort((a, b) => b.amount - a.amount);
}

export function buildMonthlyChart(ops: OperationsData) {
  const months = new Map<
    string,
    { month: string; income: number; expenses: number; net: number; sortKey: string }
  >();

  const ensure = (key: string) => {
    if (!months.has(key)) {
      months.set(key, { month: formatMonthLabel(key), income: 0, expenses: 0, net: 0, sortKey: key });
    }
    return months.get(key)!;
  };

  for (const [key, amount] of allProjectPaymentsByMonth(ops.projects)) {
    ensure(key).income += amount;
  }

  for (const exp of ops.expenses) {
    if (exp.isBaseline) continue;
    const key = exp.date.slice(0, 7);
    if (key.length === 7) ensure(key).expenses += exp.amount;
  }

  for (const entry of months.values()) {
    entry.net = entry.income - entry.expenses;
  }

  return [...months.values()].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

export function periodProjectIncome(projects: Project[], period: PeriodKey): number {
  return flattenProjectIncome(projects)
    .filter((row) => isWithinPeriod(row.date, period))
    .reduce((sum, row) => sum + row.amount, 0);
}

/**
 * Money in for a period — all time uses reconciled baseline + verified post-baseline payments.
 * Filtered periods count verified payment rows in that window only.
 */
export function periodTotalIncome(ops: OperationsData, period: PeriodKey): number {
  if (period === "all") {
    return computeFinancialSummary(ops).totalRevenueReceived;
  }
  return flattenProjectIncome(ops.projects)
    .filter((row) => row.hasProof && isWithinPeriod(row.date, period))
    .reduce((sum, row) => sum + row.amount, 0);
}

export function periodLoggedExpenses(ops: OperationsData, period: PeriodKey): number {
  return ops.expenses
    .filter((e) => !e.isBaseline && isWithinPeriod(e.date, period))
    .filter((e) => normalizeCategory(e.category) !== "handout")
    .reduce((sum, e) => sum + (e.amount || 0), 0);
}

/** Money out for a period — baseline totals when in window, logged expenses, and prorated retainers. */
export function periodMoneyOutTotal(ops: OperationsData, period: PeriodKey): number {
  const financial = computeFinancialSummary(ops);
  if (period === "all") return financial.totalExpense;

  const { baseline } = financial;
  let total = 0;
  if (isWithinPeriod(baseline.asOfDate, period)) {
    total += baseline.totalExternalPayouts + baseline.totalCompanyExpenses + baseline.founderPayoutPool;
  }

  total += periodLoggedExpenses(ops, period);
  total += proratedFixedMonthlyForPeriod(ops.fixedMonthlyExpenses, period);
  return total;
}

export function buildIncomeByClientForPeriod(
  projects: Project[],
  period: PeriodKey,
): CategoryAmountRow[] {
  const totals = new Map<string, number>();
  for (const row of flattenProjectIncome(projects)) {
    if (!isWithinPeriod(row.date, period)) continue;
    totals.set(row.client, (totals.get(row.client) ?? 0) + row.amount);
  }
  return [...totals.entries()]
    .map(([client, amount]) => ({ key: client, label: client, amount }))
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
}

export function buildIncomeSourceForPeriod(
  financial: FinancialSummary,
  periodIncome: number,
  period: PeriodKey,
): CategoryAmountRow[] {
  if (period === "all") return buildIncomeSourceBreakdown(financial);
  if (periodIncome <= 0) return [];
  return [
    {
      key: "period-payments",
      label: "Project payments",
      amount: periodIncome,
      hint: "In selected period",
    },
  ];
}

export function buildMoneyOutForPeriod(ops: OperationsData, period: PeriodKey): CategoryAmountRow[] {
  if (period === "all") return buildMoneyOutCategoryBreakdown(ops);

  const totals = new Map<ExpenseCategory, number>();
  for (const expense of ops.expenses) {
    if (expense.isBaseline || !isWithinPeriod(expense.date, period)) continue;
    const category = normalizeCategory(expense.category);
    if (!category || category === "handout") continue;
    totals.set(category, (totals.get(category) ?? 0) + (expense.amount || 0));
  }

  const rows = [...totals.entries()]
    .map(([category, amount]) => ({
      key: category,
      label: EXPENSE_CATEGORY_SHORT_LABELS[category],
      amount,
      hint: EXPENSE_CATEGORY_DESCRIPTIONS[category],
    }))
    .sort((a, b) => b.amount - a.amount);

  const retainers = proratedFixedMonthlyForPeriod(ops.fixedMonthlyExpenses, period);
  if (retainers > 0) {
    rows.push({
      key: "monthly-retainers",
      label: "Monthly retainers (est.)",
      amount: retainers,
      hint: "Prorated from active salary, EMI, rent, and subscriptions",
    });
    rows.sort((a, b) => b.amount - a.amount);
  }

  return rows;
}

export function buildMonthlyChartForPeriod(ops: OperationsData, period: PeriodKey) {
  const chart = buildMonthlyChart(ops);
  if (period === "all") return chart;
  const bounds = periodBounds(period);
  if (!bounds) return chart;
  const startMonth = bounds.start.slice(0, 7);
  const endMonth = bounds.end.slice(0, 7);
  return chart.filter((row) => row.sortKey >= startMonth && row.sortKey <= endMonth);
}

export function paymentProofCoverage(
  projects: Project[],
  period: PeriodKey,
): { withProof: number; total: number; pct: number } {
  const rows = flattenProjectIncome(projects).filter((row) => isWithinPeriod(row.date, period));
  const withProof = rows.filter((row) => row.hasProof).length;
  return {
    withProof,
    total: rows.length,
    pct: rows.length > 0 ? Math.round((withProof / rows.length) * 100) : 0,
  };
}

export type AnalyticsSnapshot = {
  periodIncome: number;
  periodExpenses: number;
  netFlow: number;
  cashBalance: number;
  activeMrr: number;
  futureMonthly: number;
  revenueBooked: number;
  activeProjects: number;
  proofCoverage: { withProof: number; total: number; pct: number };
};

export function buildAnalyticsSnapshot(ops: OperationsData, period: PeriodKey): AnalyticsSnapshot {
  const financial = computeFinancialSummary(ops);
  const periodIncome = periodTotalIncome(ops, period);
  const periodExpenses = periodMoneyOutTotal(ops, period);
  return {
    periodIncome,
    periodExpenses,
    netFlow: periodIncome - periodExpenses,
    cashBalance: financial.currentCashBalance,
    activeMrr: sumActiveMrr(ops.projects),
    futureMonthly: sumFutureMonthlyPipeline(ops.projects),
    revenueBooked: financial.totalRevenueBooked,
    activeProjects: ops.projects.filter((p) => p.status === "active").length,
    proofCoverage: paymentProofCoverage(ops.projects, period),
  };
}

function formatMonthLabel(yyyyMm: string) {
  const [y, m] = yyyyMm.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

export function paymentProofLabel(payment: ProjectPayment, project?: Project): string {
  return isVerifiedPayment(payment, project) ? "Proof attached" : "No proof";
}

export { formatINRWhole };
