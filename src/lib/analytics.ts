import { formatINRWhole } from "./invoice-calc";
import { projectClientLabel } from "./project-status";
import {
  projectBillingRows,
  sumActiveMrr,
  sumActivePipelineBooked,
  sumFutureMonthlyPipeline,
  sumPipelineBookedRevenue,
} from "./project-billing";
import { GROUND_ZERO_DATE } from "./ground-zero";
import {
  historicalReceived,
  isVerifiedPayment,
  resolvePaymentProof,
  sumProjectPayments,
  totalReceived,
} from "./project-payments";
import type {
  OperationsData,
  Payment,
  Project,
  ProjectPayment,
  ExpenseCategory,
  Transaction,
} from "./types";
import {
  buildMoneyOutRows,
  computeFinancialSummary,
  EXPENSE_CATEGORY_DESCRIPTIONS,
  EXPENSE_CATEGORY_SHORT_LABELS,
  normalizeCategory,
  type FinancialSummary,
} from "./financial";
import {
  calendarMonthKey,
  isInCalendarMonth,
  isWithinPeriod,
  isoWeekStart,
  monthsThrough,
  periodBounds,
  weekOverlapsCalendarMonth,
  type PeriodKey,
} from "./date-range-filter";
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

export {
  sumActiveMrr,
  sumFutureMonthlyPipeline,
  sumActivePipelineBooked,
  sumPipelineBookedRevenue,
  projectBillingRows,
};

export function allProjectPaymentsByMonth(payments: Payment[]): Map<string, number> {
  const months = new Map<string, number>();
  for (const payment of payments ?? []) {
    const key = payment.date.slice(0, 7);
    if (key.length !== 7) continue;
    months.set(key, (months.get(key) ?? 0) + (payment.amount || 0));
  }
  return months;
}

export function flattenProjectIncome(payments: Payment[], projects: Project[]): IncomeRow[] {
  const rows: IncomeRow[] = [];
  for (const payment of payments ?? []) {
    let client = "Unknown Client";
    if (payment.projectId) {
      const proj = projects.find((p) => p.id === payment.projectId);
      if (proj) client = proj.client;
    }
    rows.push({
      id: payment.id,
      projectId: payment.projectId ?? "",
      client,
      amount: payment.amount,
      date: payment.date,
      note: payment.notes,
      hasProof: Boolean(payment.screenshotDataUrl),
      proofImageUrl: payment.screenshotDataUrl,
    });
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

export function buildIncomeByClient(payments: Payment[], projects: Project[]): CategoryAmountRow[] {
  const totals = new Map<string, number>();
  for (const row of flattenProjectIncome(payments, projects)) {
    totals.set(row.client, (totals.get(row.client) ?? 0) + row.amount);
  }
  return [...totals.entries()]
    .map(([client, amount]) => ({ key: client, label: client, amount }))
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
}

export function buildIncomeSourceBreakdown(financial: FinancialSummary): CategoryAmountRow[] {
  if (financial.verifiedPaymentTotal > 0) {
    return [
      {
        key: "verified-payments",
        label: "Verified project payments",
        amount: financial.totalRevenueReceived,
        hint: "Income with uploaded proof",
      },
    ];
  }

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

  // Handouts are deliberately NOT listed here — they're company loans repaid
  // via the monthly EMI tracked under Fixed Costs, not operating expenses.
  const rows: CategoryAmountRow[] = moneyOut.map(({ newEntryCount: _n, ...row }) => row);

  return rows.sort((a, b) => b.amount - a.amount);
}

export function buildMonthlyChart(ops: OperationsData, month?: string) {
  const weeks = new Map<
    string,
    { month: string; income: number; expenses: number; net: number; sortKey: string }
  >();

  const ensure = (weekStart: string) => {
    if (!weeks.has(weekStart)) {
      weeks.set(weekStart, {
        month: formatWeekLabel(weekStart),
        income: 0,
        expenses: 0,
        net: 0,
        sortKey: weekStart,
      });
    }
    return weeks.get(weekStart)!;
  };

  for (const transaction of ledgerTransactions(ops)) {
    const weekStart = isoWeekStart(transaction.date);
    if (!weekStart) continue;
    if (month && !weekOverlapsCalendarMonth(weekStart, month)) continue;
    const bucket = ensure(weekStart);
    if (isMoneyInTransaction(transaction)) {
      bucket.income += moneyInAmount(transaction);
    } else if (isMoneyOutTransaction(transaction)) {
      bucket.expenses += transaction.amount;
    }
  }

  for (const entry of weeks.values()) {
    entry.net = entry.income - entry.expenses;
  }

  return [...weeks.values()].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

export type CashFlowLine = {
  name: string;
  amount: number;
  date: string;
};

export function cashFlowWeekDetails(
  ops: OperationsData,
  weekStart: string,
): { income: CashFlowLine[]; expenses: CashFlowLine[] } {
  const income: CashFlowLine[] = [];
  const expenses: CashFlowLine[] = [];
  for (const transaction of ledgerTransactions(ops)) {
    if (isoWeekStart(transaction.date) !== weekStart) continue;
    if (isMoneyInTransaction(transaction)) {
      income.push({
        name: incomeClientLabel(transaction, ops),
        amount: moneyInAmount(transaction),
        date: transaction.date,
      });
    } else if (isMoneyOutTransaction(transaction)) {
      expenses.push({
        name: moneyOutLabel(transaction),
        amount: transaction.amount,
        date: transaction.date,
      });
    }
  }
  const byAmount = (a: CashFlowLine, b: CashFlowLine) => b.amount - a.amount || a.name.localeCompare(b.name);
  return {
    income: income.sort(byAmount),
    expenses: expenses.sort(byAmount),
  };
}

/** Months with live (non-historical) ledger data after Ground Zero, through this month. */
export function liveCashflowMonths(ops: OperationsData, asOf = calendarMonthKey()): string[] {
  const end = /^\d{4}-\d{2}$/.test(asOf) ? asOf : calendarMonthKey(asOf);
  let earliest: string | null = null;
  for (const transaction of ledgerTransactions(ops)) {
    if (transaction.date < GROUND_ZERO_DATE) continue;
    const month = calendarMonthKey(transaction.date);
    if (!earliest || month < earliest) earliest = month;
  }
  return monthsThrough(earliest ?? end, end);
}

export function ledgerCashflowForMonth(ops: OperationsData, month: string) {
  let income = 0;
  let expenses = 0;
  for (const transaction of ledgerTransactions(ops)) {
    if (!isInCalendarMonth(transaction.date, month)) continue;
    if (isMoneyInTransaction(transaction)) income += moneyInAmount(transaction);
    else if (isMoneyOutTransaction(transaction)) expenses += transaction.amount;
  }
  return { income, expenses };
}

export function periodProjectIncome(
  payments: Payment[],
  projects: Project[],
  period: PeriodKey,
): number {
  return flattenProjectIncome(payments, projects)
    .filter((row) => isWithinPeriod(row.date, period))
    .reduce((sum, row) => sum + row.amount, 0);
}

/**
 * Money in for a period — only payments with uploaded proof count as income.
 */
export function periodTotalIncome(ops: OperationsData, period: PeriodKey): number {
  if (period === "all") {
    return computeFinancialSummary(ops).totalRevenueReceived;
  }
  return flattenProjectIncome(ops.payments ?? [], ops.projects)
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
    total +=
      baseline.totalExternalPayouts + baseline.totalCompanyExpenses + baseline.founderPayoutPool;
  }

  total += periodLoggedExpenses(ops, period);
  total += proratedFixedMonthlyForPeriod(ops.fixedMonthlyExpenses, period);
  return total;
}

export function buildIncomeByClientForPeriod(
  ops: OperationsData,
  period: PeriodKey,
  month?: string,
): CategoryAmountRow[] {
  const totals = new Map<string, number>();
  const countedPaymentIds = new Set<string>();
  const inScope = (date: string | undefined) =>
    month ? isInCalendarMonth(date, month) : isWithinPeriod(date, period);
  const includeHistorical = month
    ? isInCalendarMonth(GROUND_ZERO_DATE, month)
    : period === "all" || isWithinPeriod(GROUND_ZERO_DATE, period);

  const add = (label: string, amount: number) => {
    if (!amount) return;
    totals.set(label, (totals.get(label) ?? 0) + amount);
  };

  for (const project of ops.projects ?? []) {
    const label = projectMoneyInClientLabel(project, ops);
    const livePayments = livePaymentsCountedTowardReceived(project);
    if (!month && period === "all") {
      add(label, totalReceived(project));
      for (const payment of livePayments) countedPaymentIds.add(payment.id);
      continue;
    }
    if (includeHistorical) add(label, historicalReceived(project));
    for (const payment of livePayments) {
      if (!inScope(payment.date)) continue;
      add(label, payment.amount || 0);
      countedPaymentIds.add(payment.id);
    }
  }

  for (const transaction of ledgerTransactions(ops)) {
    if (!isMoneyInTransaction(transaction)) continue;
    if (!inScope(transaction.date)) continue;
    if (countedPaymentIds.has(transaction.id)) continue;
    add(incomeClientLabel(transaction, ops), moneyInAmount(transaction));
  }

  return [...totals.entries()]
    .map(([client, amount]) => ({ key: client, label: client, amount }))
    .filter((row) => row.amount !== 0)
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

export function buildMoneyOutForPeriod(
  ops: OperationsData,
  period: PeriodKey,
  month?: string,
): CategoryAmountRow[] {
  if (!month && period === "all") return buildMoneyOutCategoryBreakdown(ops);

  const inScope = (date: string | undefined) =>
    month ? isInCalendarMonth(date, month) : isWithinPeriod(date, period);

  const totals = new Map<ExpenseCategory, number>();
  for (const expense of ops.expenses) {
    if (expense.isBaseline || !inScope(expense.date)) continue;
    const category = normalizeCategory(expense.category);
    if (!category || category === "handout") continue;
    totals.set(category, (totals.get(category) ?? 0) + (expense.amount || 0));
  }

  const rows = [...totals.entries()]
    .map(([category, amount]) => ({
      key: category as string,
      label: EXPENSE_CATEGORY_SHORT_LABELS[category],
      amount,
      hint: EXPENSE_CATEGORY_DESCRIPTIONS[category],
    }))
    .sort((a, b) => b.amount - a.amount);

  const retainers = month ? 0 : proratedFixedMonthlyForPeriod(ops.fixedMonthlyExpenses, period);
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

export function buildMonthlyChartForPeriod(ops: OperationsData, period: PeriodKey, month?: string) {
  const chart = month ? buildMonthlyChart(ops, month) : buildMonthlyChart(ops);
  if (month || period === "all") return chart;
  const bounds = periodBounds(period);
  if (!bounds) return chart;
  return chart.filter((row) => row.sortKey >= bounds.start && row.sortKey <= bounds.end);
}

export function paymentProofCoverage(
  payments: Payment[],
  projects: Project[],
  period: PeriodKey,
): { withProof: number; total: number; pct: number } {
  const rows = flattenProjectIncome(payments, projects).filter((row) =>
    isWithinPeriod(row.date, period),
  );
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
    proofCoverage: paymentProofCoverage(ops.payments ?? [], ops.projects, period),
  };
}

function ledgerTransactions(ops: OperationsData): Transaction[] {
  return (ops.transactions ?? []).filter((transaction) => !transaction.historical);
}

function isMoneyInTransaction(transaction: Transaction): boolean {
  return transaction.type === "client_payment" || transaction.type === "refund";
}

function isMoneyOutTransaction(transaction: Transaction): boolean {
  if (transaction.type === "founder_withdrawal") return true;
  if (transaction.type !== "expense") return false;
  return normalizeCategory(transaction.category) !== "handout";
}

function moneyInAmount(transaction: Transaction): number {
  return transaction.type === "refund" ? -Math.abs(transaction.amount) : transaction.amount;
}

function livePaymentsCountedTowardReceived(project: Project): ProjectPayment[] {
  const payments = project.payments ?? [];
  if (project.historicalReceived == null) return payments;
  return payments.filter((payment) => payment.recordedAfterMigration === true);
}

function projectMoneyInClientLabel(project: Project, ops: OperationsData): string {
  const fromProject = projectClientLabel(project);
  if (fromProject && fromProject !== "—") return fromProject;
  if (project.clientId) {
    const client = (ops.clients ?? []).find((item) => item.id === project.clientId);
    const name = client?.companyName.trim();
    if (name) return name;
  }
  return "Unknown Client";
}

function moneyOutLabel(transaction: Transaction): string {
  const fromDescription = transaction.description.split(/[:·–]/)[0]?.trim();
  if (fromDescription) return fromDescription;
  if (transaction.type === "founder_withdrawal") return "Founder withdrawal";
  const category = normalizeCategory(transaction.category);
  if (category) return EXPENSE_CATEGORY_SHORT_LABELS[category];
  return "Expense";
}

function incomeClientLabel(transaction: Transaction, ops: OperationsData): string {
  if (transaction.relatedProjectId) {
    const project = ops.projects.find((item) => item.id === transaction.relatedProjectId);
    const name = project ? projectClientLabel(project) : "";
    if (name && name !== "—") return name;
  }
  if (transaction.relatedClientId) {
    const client = (ops.clients ?? []).find((item) => item.id === transaction.relatedClientId);
    const name = client?.companyName.trim();
    if (name) return name;
  }
  const fromDescription = transaction.description.split(/[:·–]/)[0]?.trim();
  return fromDescription || "Unknown Client";
}

function formatWeekLabel(weekStart: string) {
  const start = new Date(`${weekStart}T12:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const startText = start.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
  const endText = end.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
  if (sameMonth) {
    return `${start.getDate()}–${endText}`;
  }
  return `${startText}–${endText}`;
}

export function paymentProofLabel(payment: ProjectPayment, project?: Project): string {
  return isVerifiedPayment(payment, project) ? "Proof attached" : "No proof";
}

export { formatINRWhole };
