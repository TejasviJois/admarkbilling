import { describe, expect, it } from "vitest";
import {
  computeBookedRevenue,
  sumActiveMrr,
  sumPipelineBookedRevenue,
} from "./project-billing";
import {
  ensureKapilaRetainerBilling,
  ensureRentManagementContract,
} from "./ground-zero";
import type { OperationsData, Project } from "./types";

describe("computeBookedRevenue", () => {
  it("prefers Ground Zero locked total over a stale lower contractValue", () => {
    const rent: Project = {
      id: "proj-safe-wheels",
      client: "Alliance Square",
      name: "Rent Management",
      status: "active",
      billing: { contractValue: 70_000, upfrontAmount: 80_000 },
      historicalReceived: 0,
      historicalOutstanding: 80_000,
      payments: [],
    };
    expect(computeBookedRevenue(rent, "2026-07-25")).toBe(80_000);
  });

  it("counts monthly retainer installments as they are received", () => {
    const kapila: Project = {
      id: "proj-kapila-mgmt",
      client: "Kapila Management Software",
      name: "Kapila Management Software",
      status: "active",
      billing: {
        monthlyAmount: 10_000,
        monthlyStartDate: "2026-07-08",
      },
      historicalReceived: 10_000,
      historicalOutstanding: null,
      payments: [],
    };
    expect(computeBookedRevenue(kapila, "2026-07-25")).toBe(10_000);
    expect(sumActiveMrr([kapila], "2026-07-25")).toBe(10_000);

    const afterSecondMonth: Project = {
      ...kapila,
      payments: [
        {
          id: "p1",
          amount: 10_000,
          date: "2026-08-08",
          recordedAfterMigration: true,
        },
      ],
    };
    expect(computeBookedRevenue(afterSecondMonth, "2026-08-10")).toBe(20_000);
  });

  it("does not book future retainer months before they are received", () => {
    const future: Project = {
      id: "proj-spice-trip",
      client: "Safewheels Group",
      name: "Safewheels",
      status: "active",
      billing: {
        monthlyAmount: 20_000,
        monthlyStartDate: "2026-08-08",
      },
      payments: [],
    };
    expect(computeBookedRevenue(future, "2026-07-25")).toBe(0);
    expect(sumActiveMrr([future], "2026-07-25")).toBe(0);
  });
});

describe("ensureKapilaRetainerBilling", () => {
  it("restores historical received and ongoing MRR on the lead-won Kapila project once", () => {
    const ops: OperationsData = {
      projects: [
        {
          id: "proj-lead-lead-be258f6a",
          client: "Safewheels Group",
          name: "Kapila ERP",
          status: "active",
          billing: {
            monthlyAmount: 10_000,
            monthlyMonths: 12,
            monthlyStartDate: "2026-07-08",
          },
          payments: [],
        },
      ],
      partnerships: [],
      expenses: [],
    };

    const repaired = ensureKapilaRetainerBilling(ops);
    const kapila = repaired.projects[0];
    expect(repaired.kapilaRetainerRepairApplied).toBe(true);
    expect(kapila.client).toBe("Kapila Management Software");
    expect(kapila.historicalReceived).toBe(10_000);
    expect(kapila.billing?.monthlyMonths).toBeUndefined();
    expect(kapila.billing?.monthlyAmount).toBe(10_000);
    expect(sumActiveMrr(repaired.projects, "2026-07-25")).toBe(10_000);
    expect(computeBookedRevenue(kapila, "2026-07-25")).toBe(10_000);

    // Second pass must not overwrite intentional edits after the one-shot flag.
    const edited: OperationsData = {
      ...repaired,
      projects: [
        {
          ...kapila,
          billing: { monthlyAmount: 15_000, monthlyStartDate: "2026-07-08" },
          client: "Custom Kapila Name",
        },
      ],
    };
    const again = ensureKapilaRetainerBilling(edited);
    expect(again.projects[0].billing?.monthlyAmount).toBe(15_000);
    expect(again.projects[0].client).toBe("Custom Kapila Name");
  });

  it("does not rewrite Kapila FAQ", () => {
    const ops: OperationsData = {
      projects: [
        {
          id: "proj-kapila-faq",
          client: "Kapila FAQ",
          name: "Kapila FAQ",
          status: "completed",
          revenueValue: "Partner - Discount",
          payments: [],
        },
      ],
      partnerships: [],
      expenses: [],
    };
    const repaired = ensureKapilaRetainerBilling(ops);
    expect(repaired.projects[0].client).toBe("Kapila FAQ");
    expect(repaired.projects[0].historicalReceived).toBeUndefined();
  });
});

describe("ensureRentManagementContract", () => {
  it("clears an understated contractValue so labels match the 80k lock once", () => {
    const ops: OperationsData = {
      projects: [
        {
          id: "proj-safe-wheels",
          client: "Alliance Square",
          name: "Rent Management",
          status: "active",
          billing: { contractValue: 70_000, upfrontAmount: 80_000 },
          historicalReceived: 0,
          historicalOutstanding: 80_000,
          payments: [],
        },
      ],
      partnerships: [],
      expenses: [],
    };
    const repaired = ensureRentManagementContract(ops);
    expect(repaired.rentManagementContractRepairApplied).toBe(true);
    expect(repaired.projects[0].billing).toEqual({ upfrontAmount: 80_000 });
    expect(sumPipelineBookedRevenue(repaired.projects, "2026-07-25")).toBe(80_000);

    const edited: OperationsData = {
      ...repaired,
      projects: [
        {
          ...repaired.projects[0],
          billing: { contractValue: 90_000, upfrontAmount: 90_000 },
        },
      ],
    };
    expect(ensureRentManagementContract(edited).projects[0].billing?.contractValue).toBe(90_000);
  });
});
