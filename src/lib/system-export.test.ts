import { describe, expect, it } from "vitest";
import { buildExportSheets } from "./system-export";
import type { OperationsData } from "./types";

describe("buildExportSheets", () => {
  it("builds clean rows for Excel and CSV export", () => {
    const dummyOps: OperationsData = {
      projects: [
        {
          id: "p1",
          client: "Acme Corp",
          name: "Website Redesign",
          status: "active",
          billing: { contractValue: 100000, upfrontAmount: 50000 },
          payments: [{ id: "pay1", amount: 50000, date: "2026-10-01" }],
        },
      ],
      transactions: [
        {
          id: "t1",
          date: "2026-10-01",
          type: "client_payment",
          amount: 50000,
          description: "Advance",
          category: "revenue",
          paymentMethod: "bank_transfer",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      clients: [
        {
          id: "c1",
          companyName: "Acme Corp",
          contactPerson: "Alice",
          phone: "9876543210",
          email: "alice@acme.com",
          billingAddress: "Bangalore",
          clientSince: "2026-01-01",
          status: "active",
        },
      ],
      leads: [],
      founders: [],
      partnerships: [],
      expenses: [],
    };

    const sheets = buildExportSheets(dummyOps, []);
    expect(sheets.kpiRows.length).toBeGreaterThan(0);
    expect(sheets.projectRows).toHaveLength(1);
    expect(sheets.projectRows[0]["Client Name"]).toBe("Acme Corp");
    expect(sheets.projectRows[0]["Total Received (₹)"]).toBe(50000);
    expect(sheets.projectRows[0]["Pending Balance (₹)"]).toBe(50000);
    expect(sheets.transactionRows).toHaveLength(1);
    expect(sheets.clientRows).toHaveLength(1);
  });
});
