import type { OperationsData, Project } from "./types";

/** Remove all recorded income from projects — keeps billing/contracts for pipeline view. */
export function stripProjectIncome(projects: Project[]): Project[] {
  return projects.map((project) => ({
    ...project,
    payments: [],
    paymentProofs: undefined,
    paymentStatus: undefined,
  }));
}

/** Clear income while preserving expenses, partnerships, leads, and expense baseline. */
export function stripOperationsIncome(data: OperationsData): OperationsData {
  return {
    ...data,
    projects: stripProjectIncome(data.projects),
    financialBaseline: data.financialBaseline
      ? {
          ...data.financialBaseline,
          totalRevenueReceived: 0,
        }
      : {
          periodLabel: "Reset — re-enter income with proof",
          asOfDate: new Date().toISOString().slice(0, 10),
          totalRevenueBooked: null,
          totalHandoutsTaken: 0,
          totalRevenueReceived: 0,
          totalExternalPayouts: 0,
          totalCompanyExpenses: 0,
          founderPayoutPool: 0,
        },
  };
}
