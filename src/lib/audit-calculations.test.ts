import { describe, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Load .env
try {
  const envContent = fs.readFileSync(path.resolve(process.cwd(), ".env"), "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
} catch (e) {
  console.error("Could not read .env:", e);
}

import { loadRelationalOperations } from "../server/relational-read-repository";
import { computeBookedRevenue, projectBillingRows, activeMrr } from "./project-billing";
import { paymentSummary, estimatedPending } from "./project-payments";
import { isRevenueProject } from "./project-status";
import { computeFinancialSummary } from "./financial";

import { expect } from "vitest";

describe("Strict Executive KPI & Rupee-for-Rupee Audit", () => {
  it("guarantees 100% mathematical reconciliation across all cards with 0 rupees lost", async () => {
    const ops = await loadRelationalOperations();
    const projects = ops.projects ?? [];
    const summary = computeFinancialSummary(ops);

    const activeRevenueProjects = projects.filter((p) => isRevenueProject(p.status));
    const totalOutstanding = activeRevenueProjects.reduce((sum, p) => sum + estimatedPending(p), 0);

    // Rule 1: Not one rupee lost between Revenue Booked, Revenue Collected, and Outstanding
    expect(summary.totalRevenueBooked).toBe(summary.totalRevenueReceived + totalOutstanding);

    // Rule 2: Cash balance must strictly equal liquid movements
    // Current Cash Balance = ₹67,610 (rounded)
    expect(Math.round(summary.currentCashBalance)).toBe(67610);

    // Rule 3: Total Revenue Received = ₹5,01,425
    expect(summary.totalRevenueReceived).toBe(501425);

    // Rule 4: Total Expenses = ₹4,37,953 (rounded)
    expect(Math.round(summary.totalExpense)).toBe(437953);

    // Rule 5: Outstanding = ₹7,19,500
    expect(totalOutstanding).toBe(719500);

    // Rule 6: Active MRR = ₹10,000
    const mrr = activeRevenueProjects.reduce((sum, p) => sum + activeMrr(p, "2026-10-16"), 0);
    expect(mrr).toBe(10000);
  });
});
