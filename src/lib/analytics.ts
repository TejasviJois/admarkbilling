import { formatINRWhole } from "./invoice-calc";
import { projectClientLabel } from "./project-status";
import { sumActiveMrr, sumFutureMonthlyPipeline } from "./project-billing";
import { GROUND_ZERO_DATE } from "./ground-zero";
import { withDefaultFinancialBaseline } from "./default-financial-baseline";
import type { OperationsData, Payment, Project, Transaction } from "./types";
import {
  computeFinancialSummary,
  EXPENSE_CATEGORY_SHORT_LABELS,
  normalizeCategory,
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
  const byAmount = (a: CashFlowLine, b: CashFlowLine) =>
    b.amount - a.amount || a.name.localeCompare(b.name);
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

/** Money in / out for a rolling period (All time, 3 months, …). */
export function ledgerCashflowForPeriod(ops: OperationsData, period: PeriodKey) {
  let income = 0;
  let expenses = 0;
  for (const transaction of ledgerTransactions(ops)) {
    if (!isWithinPeriod(transaction.date, period)) continue;
    if (isMoneyInTransaction(transaction)) income += moneyInAmount(transaction);
    else if (isMoneyOutTransaction(transaction)) expenses += transaction.amount;
  }
  return { income, expenses };
}

export type SpendByCategoryRow = {
  category: string;
  amount: number;
  count: number;
  sharePct: number;
};

function spendCategoryLabel(transaction: Transaction): string {
  const raw = transaction.category?.trim();
  if (raw) {
    // Only remap the four financial ledger kinds — not free-form form categories.
    if (
      raw === "company" ||
      raw === "external_payout" ||
      raw === "founder_payout" ||
      raw === "handout"
    ) {
      return EXPENSE_CATEGORY_SHORT_LABELS[raw];
    }
    return raw;
  }
  if (transaction.type === "founder_withdrawal") return "Founder withdrawal";
  return "Uncategorized";
}

function spendByCategoryFromTransactions(
  transactions: Transaction[],
): SpendByCategoryRow[] {
  const totals = new Map<string, { amount: number; count: number }>();
  let grandTotal = 0;
  for (const transaction of transactions) {
    if (!isMoneyOutTransaction(transaction)) continue;
    const category = spendCategoryLabel(transaction);
    const prev = totals.get(category) ?? { amount: 0, count: 0 };
    prev.amount += transaction.amount;
    prev.count += 1;
    totals.set(category, prev);
    grandTotal += transaction.amount;
  }
  return [...totals.entries()]
    .map(([category, { amount, count }]) => ({
      category,
      amount,
      count,
      sharePct: grandTotal > 0 ? Math.round((amount / grandTotal) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));
}

/** Money-out totals for a calendar month, grouped by expense/form category. */
export function spendByCategoryForMonth(
  ops: OperationsData,
  month: string,
): SpendByCategoryRow[] {
  return spendByCategoryFromTransactions(
    ledgerTransactions(ops).filter((transaction) => isInCalendarMonth(transaction.date, month)),
  );
}

/** Money-out totals for a rolling period, grouped by expense/form category. */
export function spendByCategoryForPeriod(
  ops: OperationsData,
  period: PeriodKey,
): SpendByCategoryRow[] {
  return spendByCategoryFromTransactions(
    ledgerTransactions(ops).filter((transaction) => isWithinPeriod(transaction.date, period)),
  );
}

function periodTotalIncome(ops: OperationsData, period: PeriodKey): number {
  if (period === "all") {
    return computeFinancialSummary(ops).totalRevenueReceived;
  }
  const baseline = withDefaultFinancialBaseline(ops).financialBaseline!;
  let total = 0;
  if (isWithinPeriod(baseline.asOfDate, period)) {
    total += baseline.totalRevenueReceived;
  }
  const txIncome = ledgerTransactions(ops)
    .filter((t) => isMoneyInTransaction(t) && isWithinPeriod(t.date, period))
    .reduce((sum, t) => sum + moneyInAmount(t), 0);
  return total + txIncome;
}

function periodMoneyOutTotal(ops: OperationsData, period: PeriodKey): number {
  const financial = computeFinancialSummary(ops);
  if (period === "all") return financial.totalExpense;

  const { baseline } = financial;
  let total = 0;
  if (isWithinPeriod(baseline.asOfDate, period)) {
    total +=
      baseline.totalExternalPayouts + baseline.totalCompanyExpenses + baseline.founderPayoutPool;
  }

  const txExpenses = ledgerTransactions(ops)
    .filter((t) => isMoneyOutTransaction(t) && isWithinPeriod(t.date, period))
    .reduce((sum, t) => sum + t.amount, 0);

  return total + txExpenses;
}

export function buildMonthlyChartForPeriod(ops: OperationsData, period: PeriodKey, month?: string) {
  const chart = month ? buildMonthlyChart(ops, month) : buildMonthlyChart(ops);
  if (month || period === "all") return chart;
  const bounds = periodBounds(period);
  if (!bounds) return chart;
  return chart.filter((row) => row.sortKey >= bounds.start && row.sortKey <= bounds.end);
}

function paymentProofCoverage(
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
    activeProjects: (ops.projects ?? []).filter((p) => p.status === "active").length,
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
    const project = (ops.projects ?? []).find((item) => item.id === transaction.relatedProjectId);
    const name = project ? projectClientLabel(project) : "";
    if (name && name !== "—") return name;
  }
  if (transaction.relatedClientId) {
    const client = (ops.clients ?? []).find((item) => item.id === transaction.relatedClientId);
    const name = client?.companyName?.trim();
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

export { formatINRWhole };
