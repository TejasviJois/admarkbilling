import { describe, expect, it } from "vitest";
import { DEFAULT_COMPANY } from "@/lib/constants";
import { normalizeCompanySettings } from "@/lib/company-settings";
import type { CompanyMember, FixedMonthlyExpense, OperationsData } from "@/lib/types";
import {
  COMPANY_PAYROLL_EPOCH,
  applyTeamDirectoryDefaults,
  clearSalaryPayment,
  compareMembersByPayroll,
  deleteCompanyMember,
  groupMembersByType,
  isMonthEligible,
  isMonthPaid,
  isPayrollStarted,
  monthPaymentsFromSchedule,
  paymentForMonth,
  recordSalaryPayment,
  removeSalarySchedule,
  startPayroll,
  totalSalaryPaidUntilToday,
  trackerMonthsForYear,
  upsertSalarySchedule,
} from "@/lib/team-payroll";

const chetan: CompanyMember = {
  id: "member-chetan",
  name: "Chetan",
  email: "",
  phone: "",
  memberType: "intern",
  status: "active",
  baseMonthlySalary: 5000,
  salaryStartDate: "2026-06-01",
};

const emptyOps: OperationsData = {
  projects: [],
  partnerships: [],
  expenses: [],
  leads: [],
  assets: [],
  clients: [],
  payments: [],
  transactions: [],
  founders: [],
  fixedMonthlyExpenses: [],
};

describe("team-payroll", () => {
  it("starts the 2026 tracker at the payroll epoch and shows full later years", () => {
    expect(trackerMonthsForYear(2026)[0]).toBe(COMPANY_PAYROLL_EPOCH);
    expect(trackerMonthsForYear(2026)).toHaveLength(7);
    expect(trackerMonthsForYear(2027)).toHaveLength(12);
  });

  it("does not create a schedule until payroll has started", () => {
    const unpaid: CompanyMember = { ...chetan, salaryStartDate: undefined };
    const next = upsertSalarySchedule(emptyOps, unpaid);
    expect(next.fixedMonthlyExpenses ?? []).toHaveLength(0);
    expect(isPayrollStarted(unpaid)).toBe(false);
  });

  it("blocks months before June 2026 and before the member start month", () => {
    expect(isMonthEligible(chetan, "2026-05")).toBe(false);
    expect(isMonthEligible(chetan, "2026-06")).toBe(true);
    expect(isMonthEligible({ ...chetan, salaryStartDate: "2026-08-01" }, "2026-07")).toBe(false);
    expect(isMonthEligible({ ...chetan, salaryStartDate: undefined }, "2026-08")).toBe(false);
  });

  it("records full, partial, and extra payments without creating ledger transactions", () => {
    const withSchedule = upsertSalarySchedule(emptyOps, chetan);
    const full = recordSalaryPayment(withSchedule, chetan, {
      month: "2026-06",
      mode: "full",
      salaryAmount: 5000,
    });
    const partial = recordSalaryPayment(full, chetan, {
      month: "2026-07",
      mode: "partial",
      salaryAmount: 2500,
    });
    const extra = recordSalaryPayment(partial, chetan, {
      month: "2026-08",
      mode: "extra",
      salaryAmount: 5000,
      bonusAmount: 1500,
    });

    expect(paymentForMonth(extra, chetan.id, "2026-06")?.mode).toBe("full");
    expect(paymentForMonth(extra, chetan.id, "2026-07")?.salaryAmount).toBe(2500);
    expect(paymentForMonth(extra, chetan.id, "2026-08")?.bonusAmount).toBe(1500);
    expect(isMonthPaid(extra, chetan.id, "2026-08")).toBe(true);
    expect(extra.transactions ?? []).toHaveLength(0);
    expect(totalSalaryPaidUntilToday(extra, chetan.id)).toBeGreaterThanOrEqual(7_500);

    const cleared = clearSalaryPayment(extra, chetan, "2026-07");
    expect(paymentForMonth(cleared, chetan.id, "2026-07")).toBeUndefined();
    expect(cleared.transactions ?? []).toHaveLength(0);
  });

  it("migrates legacy paidMonths ticks into full-payment records", () => {
    const legacy: FixedMonthlyExpense = {
      id: "fx_salary_member-chetan",
      label: "Chetan salary",
      teamMemberId: chetan.id,
      amountPerMonth: 5000,
      kind: "salary",
      startDate: "2026-06-01",
      paidMonths: ["2026-06", "2026-07"],
      active: true,
    };
    const payments = monthPaymentsFromSchedule(legacy);
    expect(payments).toHaveLength(2);
    expect(payments[0]).toMatchObject({ month: "2026-06", mode: "full", salaryAmount: 5000 });
  });

  it("sorts the team list by employee ID", () => {
    const members: CompanyMember[] = [
      {
        id: "a",
        name: "Intern A",
        email: "",
        phone: "",
        employeeId: "ADM-005",
        memberType: "intern",
        baseMonthlySalary: 8000,
      },
      {
        id: "b",
        name: "Founder B",
        email: "",
        phone: "",
        employeeId: "ADM-002",
        memberType: "founder",
        baseMonthlySalary: 10_000,
      },
      {
        id: "c",
        name: "Founder C",
        email: "",
        phone: "",
        employeeId: "ADM-001",
        memberType: "founder",
        baseMonthlySalary: 20_000,
      },
    ];
    const sorted = [...members].sort(compareMembersByPayroll);
    expect(sorted.map((member) => member.employeeId)).toEqual(["ADM-001", "ADM-002", "ADM-005"]);
    expect(groupMembersByType(members).map((group) => group.label)).toEqual([
      "Founders",
      "Employees",
      "Interns",
      "Contractors",
    ]);
    expect(groupMembersByType(members).map((group) => group.members.length)).toEqual([2, 0, 1, 0]);
  });

  it("keeps custom member types as extra directory sections", () => {
    const members: CompanyMember[] = [
      {
        id: "a",
        name: "Advisor A",
        email: "",
        phone: "",
        memberType: "Advisor",
      },
    ];
    const groups = groupMembersByType(members, ["Advisor"]);
    expect(groups.map((group) => group.label)).toEqual([
      "Founders",
      "Employees",
      "Interns",
      "Contractors",
      "Advisor",
    ]);
    expect(groups[4]?.members.map((member) => member.id)).toEqual(["a"]);
  });

  it("starts payroll from the company epoch at the earliest", () => {
    const started = startPayroll({ ...chetan, salaryStartDate: undefined }, "2026-04");
    expect(started.salaryStartDate).toBe(`${COMPANY_PAYROLL_EPOCH}-01`);
  });

  it("assigns known ADM employee IDs and leaves Harshith/Prajwal off payroll", () => {
    const members = applyTeamDirectoryDefaults(DEFAULT_COMPANY.companyMembers ?? []);
    const byName = (needle: string) =>
      members.find((member) => member.name.toLowerCase().includes(needle));

    expect(byName("tejasvi")?.employeeId).toBe("ADM-001");
    expect(byName("harshith")?.employeeId).toBe("ADM-002");
    expect(byName("revanth")?.employeeId).toBe("ADM-003");
    expect(byName("prajwal")?.employeeId).toBe("ADM-004");
    expect(byName("chetan")?.employeeId).toBe("ADM-005");
    expect(byName("supreeth")?.employeeId).toBe("ADM-006");

    expect(isPayrollStarted(byName("harshith")!)).toBe(false);
    expect(isPayrollStarted(byName("prajwal")!)).toBe(false);
    expect(isPayrollStarted(byName("tejasvi")!)).toBe(true);
    expect(byName("tejasvi")?.salaryStartDate?.startsWith("2026-06")).toBe(true);
  });

  it("fills known IDs on existing saved company settings", () => {
    const normalized = normalizeCompanySettings({
      name: "Admark Digitals",
      address: "x",
      email: "info@admarkdigitals.com",
      teamDirectoryMigrationApplied: true,
      companyMembers: [
        {
          id: "member-tejasvi",
          name: "Tejasvi Jois",
          email: "",
          phone: "",
          memberType: "founder",
          baseMonthlySalary: 20_000,
        },
        {
          id: "member-harshith",
          name: "Harshith V Malipatil",
          email: "",
          phone: "",
          memberType: "founder",
        },
      ],
    });
    const tejasvi = normalized.companyMembers?.find((member) => member.id === "member-tejasvi");
    const harshith = normalized.companyMembers?.find((member) => member.id === "member-harshith");
    expect(tejasvi?.employeeId).toBe("ADM-001");
    expect(tejasvi?.salaryStartDate).toBe("2026-06-01");
    expect(harshith?.employeeId).toBe("ADM-002");
    expect(harshith?.salaryStartDate).toBeUndefined();
  });

  it("deletes a member and records deletedMemberIds", () => {
    const initialCompany = normalizeCompanySettings({
      ...DEFAULT_COMPANY,
      companyMembers: [
        {
          id: "member-test",
          name: "Test Member",
          email: "",
          phone: "",
          memberType: "employee",
          status: "active",
        },
        {
          id: "member-tejasvi",
          name: "Tejasvi Jois",
          email: "",
          phone: "",
          memberType: "founder",
          status: "active",
        },
      ],
    });

    const { nextCompany, removedMember } = deleteCompanyMember(initialCompany, "member-test");
    expect(removedMember?.name).toBe("Test Member");
    expect(nextCompany.companyMembers?.some((m) => m.id === "member-test")).toBe(false);
    expect(nextCompany.deletedMemberIds).toContain("member-test");

    // Normalization preserves deletion and does not revive the member
    const reNormalized = normalizeCompanySettings(nextCompany);
    expect(reNormalized.companyMembers?.some((m) => m.id === "member-test")).toBe(false);
  });

  it("removes member salary schedule and project assignments upon deletion", () => {
    const opsWithMember: OperationsData = {
      ...emptyOps,
      fixedMonthlyExpenses: [
        {
          id: "sched-test",
          label: "Salary · Test",
          kind: "salary",
          teamMemberId: "member-test",
          amountPerMonth: 10000,
          startDate: "2026-06-01",
          active: true,
          status: "active",
        },
        {
          id: "sched-other",
          label: "Office Internet",
          kind: "other",
          amountPerMonth: 2000,
          startDate: "2026-06-01",
          active: true,
          status: "active",
        },
      ],
      projects: [
        {
          id: "proj-1",
          client: "Acme Corp",
          status: "active",
          assignedMembers: ["member-test", "member-other"],
          assignedPartner: "member-test",
        },
      ],
    };

    const { nextOps, removedScheduleIds } = removeSalarySchedule(opsWithMember, "member-test");
    expect(removedScheduleIds).toEqual(["sched-test"]);
    expect(nextOps.fixedMonthlyExpenses).toHaveLength(1);
    expect(nextOps.fixedMonthlyExpenses?.[0].id).toBe("sched-other");
    expect(nextOps.projects[0].assignedMembers).toEqual(["member-other"]);
    expect(nextOps.projects[0].assignedPartner).toBe("member-other");
  });
});
