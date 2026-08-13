import { describe, expect, it } from "vitest";
import {
  buildMonthlyChart,
  buildMonthlyChartForPeriod,
  cashFlowWeekDetails,
  liveCashflowMonths,
} from "./analytics";
import { isoWeekStart } from "./date-range-filter";
import type { OperationsData, Project, Transaction } from "./types";

function tx(
  partial: Partial<Transaction> & Pick<Transaction, "id" | "type" | "date" | "amount">,
): Transaction {
  return {
    description: partial.description ?? partial.id,
    category: partial.category ?? "company",
    paymentMethod: "bank_transfer",
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  };
}

function ops(transactions: Transaction[], projects: Project[] = []): OperationsData {
  return { projects, partnerships: [], expenses: [], transactions };
}

describe("analytics cash flow from ledger", () => {
  it("buckets money in and money out by week from transactions, skipping historical rows", () => {
    const chart = buildMonthlyChart(
      ops([
        tx({
          id: "in-avighna",
          type: "client_payment",
          date: "2026-08-13",
          amount: 50_000,
          description: "Avighna foods First milestone payment",
          relatedProjectId: "proj-avighna",
        }),
        tx({
          id: "out-tools",
          type: "expense",
          date: "2026-08-14",
          amount: 12_000,
          category: "company",
          description: "Cursor reimbursement",
        }),
        tx({
          id: "historical-in",
          type: "client_payment",
          date: "2026-06-01",
          amount: 99_999,
          historical: true,
          description: "Ground Zero",
        }),
        tx({
          id: "handout",
          type: "expense",
          date: "2026-08-14",
          amount: 5_000,
          category: "handout",
          description: "Loan",
        }),
      ]),
    );

    expect(chart).toHaveLength(1);
    expect(chart[0]?.sortKey).toBe(isoWeekStart("2026-08-13"));
    expect(chart[0]?.income).toBe(50_000);
    expect(chart[0]?.expenses).toBe(12_000);
    expect(chart[0]?.net).toBe(38_000);
  });

  it("keeps all-time weekly rows when period is all", () => {
    const chart = buildMonthlyChartForPeriod(
      ops([
        tx({ id: "a", type: "client_payment", date: "2026-06-15", amount: 1, description: "A" }),
        tx({ id: "b", type: "client_payment", date: "2026-08-13", amount: 2, description: "B" }),
      ]),
      "all",
    );
    expect(chart.length).toBeGreaterThanOrEqual(2);
  });

  it("filters weekly chart rows to the selected calendar month", () => {
    const chart = buildMonthlyChartForPeriod(
      ops([
        tx({ id: "july", type: "client_payment", date: "2026-07-20", amount: 10, description: "July" }),
        tx({ id: "aug", type: "client_payment", date: "2026-08-13", amount: 20, description: "Aug" }),
      ]),
      "all",
      "2026-08",
    );
    expect(chart).toHaveLength(1);
    expect(chart[0]?.income).toBe(20);
  });

  it("shows a 27 Jul–2 Aug week in full in both July and August", () => {
    const data = ops([
      tx({
        id: "in-july",
        type: "client_payment",
        date: "2026-07-28",
        amount: 50_000,
        description: "Srivatsanka Events",
      }),
      tx({
        id: "in-aug",
        type: "client_payment",
        date: "2026-08-01",
        amount: 20_000,
        description: "Alliance Square",
      }),
      tx({
        id: "out-july",
        type: "expense",
        date: "2026-07-30",
        amount: 51_200,
        description: "Laptop EMI",
      }),
    ]);
    const week = isoWeekStart("2026-07-28")!;
    const july = buildMonthlyChartForPeriod(data, "all", "2026-07").find((row) => row.sortKey === week);
    const august = buildMonthlyChartForPeriod(data, "all", "2026-08").find(
      (row) => row.sortKey === week,
    );
    expect(july?.income).toBe(70_000);
    expect(july?.expenses).toBe(51_200);
    expect(july?.net).toBe(18_800);
    expect(august?.income).toBe(70_000);
    expect(august?.expenses).toBe(51_200);
    expect(august?.net).toBe(18_800);

    const details = cashFlowWeekDetails(data, week);
    const namedIn = details.income.reduce((sum, line) => sum + line.amount, 0);
    const namedOut = details.expenses.reduce((sum, line) => sum + line.amount, 0);
    expect(namedIn - namedOut).toBe(18_800);
    expect(namedIn - namedOut).toBe(july?.net);
  });

  it("lists week money in and money out by name", () => {
    const week = isoWeekStart("2026-08-13")!;
    const details = cashFlowWeekDetails(
      ops(
        [
          tx({
            id: "in-avighna",
            type: "client_payment",
            date: "2026-08-13",
            amount: 33_000,
            relatedProjectId: "proj-avighna",
          }),
          tx({
            id: "out-tools",
            type: "expense",
            date: "2026-08-14",
            amount: 5_349,
            category: "company",
            description: "Cursor reimbursement",
          }),
        ],
        [{ id: "proj-avighna", client: "Avighna Consultancy", status: "active" } as Project],
      ),
      week,
    );
    expect(details.income).toEqual([
      expect.objectContaining({ name: "Avighna Consultancy", amount: 33_000 }),
    ]);
    expect(details.expenses).toEqual([
      expect.objectContaining({ name: "Cursor reimbursement", amount: 5_349 }),
    ]);
  });

  it("builds month options from first live Ground Zero month through asOf", () => {
    expect(
      liveCashflowMonths(
        ops([
          tx({
            id: "july",
            type: "client_payment",
            date: "2026-07-20",
            amount: 1,
            description: "July",
          }),
        ]),
        "2026-08",
      ),
    ).toEqual(["2026-07", "2026-08"]);
    expect(liveCashflowMonths(ops([]), "2026-08")).toEqual(["2026-08"]);
  });
});
