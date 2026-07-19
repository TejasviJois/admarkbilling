import { describe, expect, it } from "vitest";
import { fixedMonthlyDueDate } from "./fixed-monthly-expenses";
import type { FixedMonthlyExpense } from "./types";

const salary: FixedMonthlyExpense = {
  id: "salary-1",
  label: "Team salary",
  amountPerMonth: 20_000,
  kind: "salary",
  startDate: "2026-07-08",
  reminderDay: 1,
  active: true,
};

describe("fixedMonthlyDueDate", () => {
  it("never places the first due date before the schedule start date", () => {
    expect(fixedMonthlyDueDate(salary, "2026-07")).toBe("2026-07-08");
  });

  it("uses the configured due day from the following month onward", () => {
    expect(fixedMonthlyDueDate(salary, "2026-08")).toBe("2026-08-01");
  });
});
