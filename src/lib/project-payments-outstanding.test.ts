import { describe, expect, it } from "vitest";
import { outstandingBalance, paymentSummary } from "./project-payments";
import type { Project } from "./types";

function project(partial: Partial<Project> & Pick<Project, "id" | "client" | "status">): Project {
  return {
    name: partial.name ?? partial.client,
    ...partial,
  };
}

describe("outstandingBalance", () => {
  it("uses contract − received when historicalOutstanding is null (Avighna)", () => {
    const p = project({
      id: "avighna",
      client: "Avighna",
      status: "active",
      billing: { contractValue: 330_000 },
      historicalReceived: 0,
      historicalOutstanding: null,
      payments: [
        { id: "tx-1", amount: 50_000, date: "2026-08-01", recordedAfterMigration: true },
      ],
    });
    expect(outstandingBalance(p)).toBe(280_000);
    expect(paymentSummary(p).pending).toBe(280_000);
    expect(paymentSummary(p).target).toBe(330_000);
  });

  it("shows full upfront when unpaid (Lead Management / Asian Apex)", () => {
    const p = project({
      id: "lead-mgmt",
      client: "Alliance Square",
      status: "completed",
      billing: { upfrontAmount: 25_000 },
      historicalReceived: 0,
      historicalOutstanding: null,
      payments: [],
    });
    expect(outstandingBalance(p)).toBe(25_000);
  });

  it("keeps pure retainers without a contract outstanding", () => {
    const p = project({
      id: "kapila",
      client: "Kapila",
      status: "active",
      billing: { monthlyAmount: 10_000, monthlyStartDate: "2026-07-08" },
      historicalReceived: 10_000,
      historicalOutstanding: null,
      payments: [],
    });
    expect(outstandingBalance(p)).toBeNull();
    expect(paymentSummary(p).pending).toBeNull();
  });

  it("uses Ground Zero lock minus post-migration receipts (Srivatsanka)", () => {
    const p = project({
      id: "kannan",
      client: "Srivatsanka",
      status: "active",
      billing: { contractValue: 140_000, monthlyAmount: 8_500, monthlyMonths: 12 },
      historicalReceived: 30_000,
      historicalOutstanding: 110_000,
      payments: [
        { id: "tx-phase-2", amount: 50_000, date: "2026-07-29", recordedAfterMigration: true },
      ],
    });
    expect(outstandingBalance(p)).toBe(60_000);
  });
});
