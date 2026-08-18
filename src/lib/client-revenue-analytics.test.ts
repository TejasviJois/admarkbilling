import { describe, expect, it } from "vitest";
import type { Client, Project } from "./types";
import {
  buildClientRevenueBreakdown,
  fyRetainerRemainingRevenue,
  projectTotalRevenueOutlook,
  retainerMonthsInFinancialYear,
} from "./client-revenue-analytics";
import { computeBookedRevenue } from "./project-billing";

const kapila: Project = {
  id: "proj-kapila-mgmt",
  client: "Kapila Management Software",
  name: "Kapila ERP",
  projectType: "Dashboard",
  status: "active",
  revenueValue: "₹10,000/month (ongoing)",
  historicalReceived: 10_000,
  billing: {
    monthlyAmount: 10_000,
    monthlyStartDate: "2026-07-08",
  },
};

describe("client revenue analytics", () => {
  it("counts Kapila retainer months through FY end and adds remaining to total", () => {
    expect(retainerMonthsInFinancialYear(kapila, "2026-08-18")).toBe(9);
    expect(computeBookedRevenue(kapila, "2026-08-18")).toBe(10_000);
    expect(fyRetainerRemainingRevenue(kapila, "2026-08-18")).toBe(80_000);
    expect(projectTotalRevenueOutlook(kapila, "2026-08-18")).toBe(90_000);
  });

  it("groups multiple projects under the same client name", () => {
    const projects: Project[] = [
      {
        id: "p1",
        client: "Avignya",
        name: "Avignya Website",
        status: "active",
        revenueValue: "₹1,50,000",
        billing: { upfrontAmount: 150_000 },
      },
      {
        id: "p2",
        client: "Avignya",
        name: "Avignya App",
        status: "completed",
        revenueValue: "₹1,95,000",
        billing: { upfrontAmount: 195_000 },
      },
      {
        ...kapila,
        id: "p3",
      },
    ];

    const summary = buildClientRevenueBreakdown(projects, "2026-08-18");
    const avignya = summary.clients.find((row) => row.client === "Avignya");

    expect(avignya?.projectCount).toBe(2);
    expect(avignya?.activeCount).toBe(1);
    expect(avignya?.completedCount).toBe(1);
    expect(avignya?.booked).toBe(345_000);
    expect(avignya?.total).toBe(345_000);
    expect(summary.totalRevenue).toBe(435_000);
  });

  it("merges short and legal names for the same client", () => {
    const projects: Project[] = [
      {
        id: "p1",
        client: "Avighna",
        name: "Avighna",
        status: "active",
        billing: { upfrontAmount: 330_000 },
      },
      {
        id: "p2",
        client: "Avighna Speciality Ingredients Pvt Ltd",
        name: "Avighna Speciality Ingredients Pvt Ltd",
        status: "completed",
        billing: { upfrontAmount: 15_000 },
      },
    ];

    const summary = buildClientRevenueBreakdown(projects, "2026-08-18");
    expect(summary.clients).toHaveLength(1);
    expect(summary.clients[0]?.client).toBe("Avighna");
    expect(summary.clients[0]?.projectCount).toBe(2);
    expect(summary.clients[0]?.total).toBe(345_000);
  });

  it("rolls child companies up to the parent client group", () => {
    const clients: Client[] = [
      {
        id: "cli-safewheels",
        companyName: "Safewheels Group",
        contactPerson: "Safewheels",
        phone: "",
        email: "",
        billingAddress: "",
        clientSince: "2026-01-01",
        status: "active",
      },
      {
        id: "cli-kapila",
        parentClientId: "cli-safewheels",
        companyName: "Kapila Management Software",
        contactPerson: "Kapila",
        phone: "",
        email: "",
        billingAddress: "",
        clientSince: "2026-01-01",
        status: "active",
      },
      {
        id: "cli-faq",
        parentClientId: "cli-safewheels",
        companyName: "Kapila FAQ",
        contactPerson: "Kapila",
        phone: "",
        email: "",
        billingAddress: "",
        clientSince: "2026-01-01",
        status: "active",
      },
    ];

    const projects: Project[] = [
      {
        ...kapila,
        clientId: "cli-kapila",
      },
      {
        id: "proj-kapila-faq",
        clientId: "cli-faq",
        client: "Kapila FAQ",
        name: "Kapila FAQ",
        projectType: "Whatsapp Bot",
        status: "completed",
        billing: { upfrontAmount: 0 },
        historicalReceived: 0,
      },
      {
        id: "proj-safe-wheels",
        client: "Safe Wheels",
        name: "Dashboard",
        status: "active",
        billing: { monthlyAmount: 20_000, monthlyStartDate: "2026-08-08" },
      },
    ];

    const summary = buildClientRevenueBreakdown(projects, "2026-08-18", clients);
    const group = summary.clients.find((row) => row.client === "Safewheels Group");

    expect(group).toBeDefined();
    expect(group?.projectCount).toBe(3);
    expect(group?.activeCount).toBe(2);
    expect(group?.completedCount).toBe(1);
    expect(group?.fyRemaining).toBeGreaterThan(0);
    expect(summary.clients.some((row) => row.client === "Kapila Management Software")).toBe(false);
  });
});
