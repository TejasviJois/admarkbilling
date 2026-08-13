import { describe, expect, it } from "vitest";
import {
  buildIncomeByClientForPeriod,
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

  it("names money-in by the linked project client so Avighna appears", () => {
    const rows = buildIncomeByClientForPeriod(
      ops(
        [
          tx({
            id: "in-avighna",
            type: "client_payment",
            date: "2026-08-13",
            amount: 50_000,
            description: "Avighna foods First milestone payment",
            relatedProjectId: "proj-avighna",
          }),
        ],
        [
          {
            id: "proj-avighna",
            client: "Avighna Consultancy & Services",
            status: "active",
            startDate: "2026-01-01",
          } as Project,
        ],
      ),
      "all",
    );

    expect(rows).toEqual([
      expect.objectContaining({
        label: "Avighna Consultancy & Services",
        amount: 50_000,
      }),
    ]);
  });

  it("falls back to the payment description when no project or client is linked", () => {
    const rows = buildIncomeByClientForPeriod(
      ops([
        tx({
          id: "in-avighna",
          type: "client_payment",
          date: "2026-08-13",
          amount: 50_000,
          description: "Avighna foods First milestone payment",
        }),
      ]),
      "all",
    );
    expect(rows[0]?.label).toBe("Avighna foods First milestone payment");
    expect(rows[0]?.amount).toBe(50_000);
  });

  it("adds Ground Zero historical received to live payments for Srivatsanka", () => {
    const rows = buildIncomeByClientForPeriod(
      ops(
        [
          tx({
            id: "pay-ksc-live",
            type: "client_payment",
            date: "2026-08-01",
            amount: 50_000,
            relatedProjectId: "proj-ksc",
          }),
        ],
        [
          {
            id: "proj-ksc",
            client: "Karnataka Sports Council",
            status: "active",
            startDate: "2026-01-01",
            historicalReceived: 30_000,
            historicalOutstanding: 110_000,
            payments: [
              {
                id: "pay-ksc-live",
                amount: 50_000,
                date: "2026-08-01",
                recordedAfterMigration: true,
              },
            ],
          } as Project,
        ],
      ),
      "all",
    );

    expect(rows).toEqual([
      expect.objectContaining({
        label: "Karnataka Sports Council",
        amount: 80_000,
      }),
    ]);
  });

  it("shows BLX collected cash, not remaining outstanding", () => {
    const rows = buildIncomeByClientForPeriod(
      ops(
        [
          tx({
            id: "pay-blx-live",
            type: "client_payment",
            date: "2026-08-05",
            amount: 23_000,
            relatedProjectId: "proj-blx",
          }),
        ],
        [
          {
            id: "proj-blx",
            client: "BLX Realty",
            status: "active",
            startDate: "2026-01-01",
            historicalReceived: 25_000,
            historicalOutstanding: 52_000,
            payments: [
              {
                id: "pay-blx-live",
                amount: 23_000,
                date: "2026-08-05",
                recordedAfterMigration: true,
              },
            ],
          } as Project,
        ],
      ),
      "all",
    );

    expect(rows).toEqual([
      expect.objectContaining({
        label: "BLX Realty",
        amount: 48_000,
      }),
    ]);
    expect(rows[0]?.amount).not.toBe(29_000);
  });

  it("does not double-count a live payment that is already on the project", () => {
    const rows = buildIncomeByClientForPeriod(
      ops(
        [
          tx({
            id: "pay-same",
            type: "client_payment",
            date: "2026-08-10",
            amount: 10_000,
            relatedProjectId: "proj-same",
          }),
        ],
        [
          {
            id: "proj-same",
            client: "Same Client",
            status: "active",
            startDate: "2026-01-01",
            historicalReceived: 5_000,
            payments: [
              {
                id: "pay-same",
                amount: 10_000,
                date: "2026-08-10",
                recordedAfterMigration: true,
              },
            ],
          } as Project,
        ],
      ),
      "all",
    );

    expect(rows[0]?.amount).toBe(15_000);
  });

  it("still includes an orphan live payment with no matching project payment", () => {
    const rows = buildIncomeByClientForPeriod(
      ops(
        [
          tx({
            id: "orphan-live",
            type: "client_payment",
            date: "2026-08-13",
            amount: 12_000,
            description: "Orphan retainer",
          }),
        ],
        [
          {
            id: "proj-other",
            client: "Other Client",
            status: "active",
            startDate: "2026-01-01",
            historicalReceived: 1_000,
          } as Project,
        ],
      ),
      "all",
    );

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Other Client", amount: 1_000 }),
        expect.objectContaining({ label: "Orphan retainer", amount: 12_000 }),
      ]),
    );
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
