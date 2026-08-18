import { describe, expect, it } from "vitest";
import {
  GROUND_ZERO_BASELINE,
  GROUND_ZERO_TRANSACTIONS,
  applyProductionBillingRepairs,
  ensureHistoricalExpenseReconciliation,
} from "./ground-zero";
import { computeFinancialSummary } from "./financial";
import type { OperationsData } from "./types";

describe("historical expense reconciliation", () => {
  it("adds ₹2,000 to baseline company expenses once and leaves cash unchanged", () => {
    const ops: OperationsData = {
      projects: [],
      partnerships: [],
      expenses: [],
      financialBaseline: {
        periodLabel: "test",
        asOfDate: "2026-07-17",
        totalRevenueBooked: null,
        totalHandoutsTaken: 0,
        totalRevenueReceived: 303_725,
        totalExternalPayouts: 0,
        totalCompanyExpenses: 67_092,
        founderPayoutPool: 91_894,
      },
      transactions: [
        {
          id: "tx-gz-opening-balance",
          type: "adjustment",
          date: "2026-07-17",
          amount: 142_739,
          description: "Opening Balance",
          category: "Opening Balance",
          paymentMethod: "bank_transfer",
        },
        {
          id: "tx-gz-historical-expense",
          type: "expense",
          date: "2026-07-17",
          amount: 101_459,
          description: "Historical Expense Adjustment",
          category: "Historical Expense",
          paymentMethod: "bank_transfer",
          historical: true,
        },
      ],
    };

    const before = computeFinancialSummary(ops);
    const repaired = ensureHistoricalExpenseReconciliation(ops);
    const after = computeFinancialSummary(repaired);

    expect(repaired.historicalExpenseReconciliationApplied).toBe(true);
    expect(repaired.financialBaseline?.totalCompanyExpenses).toBe(69_092);
    expect(
      repaired.transactions?.find((transaction) => transaction.id === "tx-gz-historical-expense")
        ?.amount,
    ).toBe(103_459);
    expect(after.totalExpense).toBe(before.totalExpense + 2_000);
    expect(after.currentCashBalance).toBe(before.currentCashBalance);
    expect(after.totalRevenueReceived - after.totalExpense).toBe(after.currentCashBalance);

    const again = ensureHistoricalExpenseReconciliation(repaired);
    expect(again.financialBaseline?.totalCompanyExpenses).toBe(69_092);
  });

  it("runs through production repairs and keeps Ground Zero seed already reconciled", () => {
    const seeded: OperationsData = {
      projects: [],
      partnerships: [],
      expenses: [],
      financialBaseline: { ...GROUND_ZERO_BASELINE },
      transactions: GROUND_ZERO_TRANSACTIONS.map((transaction) => ({ ...transaction })),
      historicalExpenseReconciliationApplied: true,
    };
    const repaired = applyProductionBillingRepairs(seeded);
    expect(repaired.financialBaseline?.totalCompanyExpenses).toBe(36_564.48);
    expect(
      repaired.transactions?.find((transaction) => transaction.id === "tx-gz-historical-expense")
        ?.amount,
    ).toBe(103_459);
  });
});
