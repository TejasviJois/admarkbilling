import { formatINR } from "./invoice-calc";
import { DEFAULT_FINANCIAL_BASELINE, withDefaultFinancialBaseline } from "./default-financial-baseline";
import { sumBookedProjectRevenue } from "./project-billing";
import type { ExpenseCategory, ExpenseEntry, FinancialBaseline, OperationsData, Project } from "./types";

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

export type FinancialSummary = {
  baseline: FinancialBaseline;
  totalRevenueBooked: number;
  totalHandoutsTaken: number;
  totalRevenueReceived: number;
  totalExternalPayouts: number;
  totalCompanyExpenses: number;
  founderPayoutPool: number;
  totalExpense: number;
  currentCashBalance: number;
  newExpenseCount: number;
  newRevenueAfterBaseline: number;
};

function sumProjectPaymentsAfter(projects: Project[], afterDate: string): number {
  let sum = 0;
  for (const project of projects) {
    for (const payment of project.payments ?? []) {
      if (payment.date > afterDate) sum += payment.amount || 0;
    }
  }
  return sum;
}

function sumExpensesByCategory(expenses: ExpenseEntry[], category: ExpenseCategory): number {
  return expenses
    .filter((e) => !e.isBaseline && normalizeCategory(e.category) === category)
    .reduce((s, e) => s + e.amount, 0);
}

export function normalizeCategory(category: string | undefined): ExpenseCategory | undefined {
  if (!category) return undefined;
  if (category === "company" || category === "external_payout" || category === "founder_payout" || category === "handout") {
    return category;
  }
  return "company";
}

export function expenseCategoryLabel(category: string | undefined): string {
  const normalized = normalizeCategory(category);
  return normalized ? EXPENSE_CATEGORY_LABELS[normalized] : category?.trim() || "Company expense";
}

export function computeFinancialSummary(ops: OperationsData): FinancialSummary {
  const withBaseline = withDefaultFinancialBaseline(ops);
  const baseline = withBaseline.financialBaseline!;
  const newExpenses = ops.expenses.filter((e) => !e.isBaseline);

  const newExternal = sumExpensesByCategory(newExpenses, "external_payout");
  const newCompany = sumExpensesByCategory(newExpenses, "company");
  const newFounder = sumExpensesByCategory(newExpenses, "founder_payout");
  const newHandouts = sumExpensesByCategory(newExpenses, "handout");
  const newRevenueAfterBaseline = sumProjectPaymentsAfter(ops.projects, baseline.asOfDate);

  const totalRevenueReceived = baseline.totalRevenueReceived + newRevenueAfterBaseline;
  const totalExternalPayouts = baseline.totalExternalPayouts + newExternal;
  const totalCompanyExpenses = baseline.totalCompanyExpenses + newCompany;
  const founderPayoutPool = baseline.founderPayoutPool + newFounder;
  const totalHandoutsTaken = baseline.totalHandoutsTaken + newHandouts;

  const totalExpense = totalExternalPayouts + totalCompanyExpenses + founderPayoutPool;
  const currentCashBalance = totalRevenueReceived - totalExpense;
  const totalRevenueBooked =
    baseline.totalRevenueBooked ?? sumBookedProjectRevenue(ops.projects);

  return {
    baseline,
    totalRevenueBooked,
    totalHandoutsTaken,
    totalRevenueReceived,
    totalExternalPayouts,
    totalCompanyExpenses,
    founderPayoutPool,
    totalExpense,
    currentCashBalance,
    newExpenseCount: newExpenses.length,
    newRevenueAfterBaseline,
  };
}

export function formatFinancialINR(n: number): string {
  return formatINR(n);
}

export { DEFAULT_FINANCIAL_BASELINE };
