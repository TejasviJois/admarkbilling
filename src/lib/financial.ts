import { formatINR } from "./invoice-calc";
import {
  DEFAULT_FINANCIAL_BASELINE,
  withDefaultFinancialBaseline,
} from "./default-financial-baseline";
import { sumPipelineBookedRevenue } from "./project-billing";
import { sumActiveFixedMonthlyExpenses } from "./fixed-monthly-expenses";
import { isFounderSalary } from "./founder-ledger";
import type {
  ExpenseCategory,
  ExpenseEntry,
  FinancialBaseline,
  OperationsData,
  Project,
} from "./types";
export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "company",
  "external_payout",
  "founder_payout",
  "handout",
];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  company: "Company expenses",
  external_payout: "External payouts (vendors & partners)",
  founder_payout: "Founder salaries",
  handout: "Company handouts (loan)",
};

export const EXPENSE_CATEGORY_DESCRIPTIONS: Record<ExpenseCategory, string> = {
  company: "Operating costs — tools, subscriptions, office, and misc. company spend.",
  external_payout: "Payments made to vendors, partners, and merchants.",
  founder_payout: "Salaries paid to founders until today.",
  handout: "Money taken as a company loan — tracked separately from cash balance.",
};

/** Compact labels for dashboards — extend when categories grow. */
export const EXPENSE_CATEGORY_SHORT_LABELS: Record<ExpenseCategory, string> = {
  company: "Company",
  external_payout: "Vendors & partners",
  founder_payout: "Founders",
  handout: "Handouts",
};

/** Categories that reduce cash balance (excludes handouts). */
export const MONEY_OUT_CATEGORIES = ["company", "founder_payout", "external_payout"] as const;

export type MoneyOutCategoryRow = {
  category: ExpenseCategory;
  label: string;
  amount: number;
  newEntryCount: number;
};

export function buildMoneyOutRows(
  financial: FinancialSummary,
  expenses: ExpenseEntry[],
): MoneyOutCategoryRow[] {
  const amounts: Record<(typeof MONEY_OUT_CATEGORIES)[number], number> = {
    company: financial.totalCompanyExpenses,
    founder_payout: financial.founderPayoutPool,
    external_payout: financial.totalExternalPayouts,
  };
  const logged = expenses.filter((e) => !e.isBaseline);

  return MONEY_OUT_CATEGORIES.map((category) => ({
    category,
    label: EXPENSE_CATEGORY_SHORT_LABELS[category],
    amount: amounts[category],
    newEntryCount: logged.filter((e) => normalizeCategory(e.category) === category).length,
  }));
}

export type FinancialSummary = {
  baseline: FinancialBaseline;
  totalRevenueBooked: number;
  totalHandoutsTaken: number;
  totalRevenueReceived: number;
  totalExternalPayouts: number;
  totalCompanyExpenses: number;
  founderPayoutPool: number;
  founderInvestments: number;
  totalExpense: number;
  currentCashBalance: number;
  newExpenseCount: number;
  newRevenueAfterBaseline: number;
  verifiedPaymentTotal: number;
  totalMonthlyFixedExpenses: number;
  activePipelineBooked: number;
};

export function computeFinancialSummary(ops: OperationsData): FinancialSummary {
  const withBaseline = withDefaultFinancialBaseline(ops);
  const baseline = withBaseline.financialBaseline!;

  // Historical rows (imported pre-migration context) are ledger display only.
  // The baseline totals + Opening Balance adjustment already account for them,
  // so summing them again would double count and corrupt the cash balance.
  const txs = (ops.transactions ?? []).filter((t) => !t.historical);

  // Movements since migration — calculated from the unified Transactions table.
  const clientPayments = txs.filter((t) => t.type === "client_payment" || t.type === "refund");
  const revenueAmount = (transaction: (typeof txs)[number]) =>
    transaction.type === "refund" ? -Math.abs(transaction.amount) : transaction.amount;
  const newRevenueAfterBaseline = clientPayments.reduce(
    (sum, transaction) => sum + revenueAmount(transaction),
    0,
  );
  const totalRevenueReceived = baseline.totalRevenueReceived + newRevenueAfterBaseline;

  const expenses = txs.filter((t) => t.type === "expense");
  const newExternalPayouts = expenses
    .filter((transaction) => normalizeCategory(transaction.category) === "external_payout")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const legacyFounderSalaries = txs
    .filter(isFounderSalary)
    .filter((transaction) => transaction.type === "founder_withdrawal")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const newCompanyExpenses =
    expenses
      .filter((transaction) => normalizeCategory(transaction.category) !== "external_payout")
      .reduce((sum, transaction) => sum + transaction.amount, 0) + legacyFounderSalaries;

  const founderWithdrawals = txs
    .filter((t) => t.type === "founder_withdrawal" && !isFounderSalary(t))
    .reduce((sum, t) => sum + t.amount, 0);
  const founderInvestments = txs
    .filter((t) => t.type === "founder_investment")
    .reduce((sum, t) => sum + t.amount, 0);
  const newHandoutsTaken = txs
    .filter((t) => t.type === "internal_transfer" && t.category === "handout")
    .reduce((sum, t) => sum + t.amount, 0);

  // Totals = reconciled baseline (Ground Zero Excel) + everything logged since.
  const totalExternalPayouts = baseline.totalExternalPayouts + newExternalPayouts;
  const totalCompanyExpenses = baseline.totalCompanyExpenses + newCompanyExpenses;
  const founderPayoutPool = baseline.founderPayoutPool + founderWithdrawals;
  const totalHandoutsTaken = baseline.totalHandoutsTaken + newHandoutsTaken;
  const totalExpense = totalExternalPayouts + totalCompanyExpenses + founderPayoutPool;

  // Cash = Opening Balance adjustment (authoritative, never recalculated)
  //        + net movement of post-migration transactions.
  const cashAdjustments = txs
    .filter((transaction) => transaction.type === "adjustment")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const newExpenseTotal = newExternalPayouts + newCompanyExpenses + founderWithdrawals;
  const currentCashBalance =
    cashAdjustments + newRevenueAfterBaseline + founderInvestments - newExpenseTotal;

  const activePipelineBooked = sumPipelineBookedRevenue(ops.projects);
  // Revenue booked is live: contract values plus recurring installments
  // received to date. Future recurring months remain in MRR/FMRR and are not
  // booked early. The frozen Ground Zero figure goes stale after project edits.
  const totalRevenueBooked = activePipelineBooked;
  const totalMonthlyFixedExpenses = sumActiveFixedMonthlyExpenses(ops.fixedMonthlyExpenses);

  return {
    baseline,
    totalRevenueBooked,
    totalHandoutsTaken,
    totalRevenueReceived,
    totalExternalPayouts,
    totalCompanyExpenses,
    founderPayoutPool,
    founderInvestments,
    totalExpense,
    currentCashBalance,
    newExpenseCount: expenses.length,
    newRevenueAfterBaseline,
    verifiedPaymentTotal: totalRevenueReceived,
    totalMonthlyFixedExpenses,
    activePipelineBooked,
  };
}

export function normalizeCategory(category: string | undefined): ExpenseCategory | undefined {
  if (!category) return undefined;
  if (
    category === "company" ||
    category === "external_payout" ||
    category === "founder_payout" ||
    category === "handout"
  ) {
    return category;
  }
  return "company";
}

export function expenseCategoryLabel(category: string | undefined): string {
  const normalized = normalizeCategory(category);
  return normalized ? EXPENSE_CATEGORY_LABELS[normalized] : category?.trim() || "Company expense";
}

export function formatFinancialINR(n: number): string {
  return formatINR(n);
}

export { DEFAULT_FINANCIAL_BASELINE };
