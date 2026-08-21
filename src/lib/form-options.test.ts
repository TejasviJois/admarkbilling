import { describe, expect, it } from "vitest";
import { spendByCategoryForMonth } from "./analytics";
import { normalizeFormOptions } from "./form-options";
import type { OperationsData, Transaction } from "./types";

function tx(partial: Partial<Transaction> & Pick<Transaction, "id" | "amount" | "date">): Transaction {
  return {
    type: "expense",
    description: partial.description ?? "Expense",
    category: partial.category ?? "Miscellaneous",
    paymentMethod: "bank_transfer",
    createdAt: 1,
    updatedAt: 1,
    historical: false,
    ...partial,
  };
}

describe("normalizeFormOptions", () => {
  it("seeds defaults when empty", () => {
    const catalogs = normalizeFormOptions(undefined);
    expect(catalogs.expenseCategories).toContain("Hosting");
    expect(catalogs.incomeCategories).toContain("Client Income");
    expect(catalogs.paymentMethods.length).toBeGreaterThan(0);
  });

  it("keeps custom lists and dedupes case-insensitively", () => {
    const catalogs = normalizeFormOptions({
      expenseCategories: ["Rent", "rent", " Software "],
    });
    expect(catalogs.expenseCategories).toEqual(["Rent", "Software"]);
  });
});

describe("spendByCategoryForMonth", () => {
  it("groups money-out by category for the month", () => {
    const ops = {
      transactions: [
        tx({ id: "1", amount: 1000, date: "2026-08-02", category: "Hosting" }),
        tx({ id: "2", amount: 500, date: "2026-08-10", category: "Hosting" }),
        tx({ id: "3", amount: 2000, date: "2026-08-12", category: "Salary" }),
        tx({ id: "4", amount: 300, date: "2026-07-01", category: "Travel" }),
        tx({
          id: "5",
          amount: 100,
          date: "2026-08-15",
          type: "client_payment",
          category: "Client Income",
        }),
      ],
      projects: [],
      expenses: [],
      payments: [],
    } as unknown as OperationsData;

    const rows = spendByCategoryForMonth(ops, "2026-08");
    expect(rows).toEqual([
      { category: "Salary", amount: 2000, count: 1, sharePct: 57.1 },
      { category: "Hosting", amount: 1500, count: 2, sharePct: 42.9 },
    ]);
  });
});
