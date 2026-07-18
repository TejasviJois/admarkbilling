import type { Transaction } from "./types";

/** Category used when a founder payout is company pay (salary), not an equity draw. */
export const FOUNDER_SALARY_CATEGORY = "Salary";

/** Category used when a founder payout draws down their invested share. */
export const FOUNDER_SHARE_WITHDRAWAL_CATEGORY = "Founder Payout";

/**
 * Salary payouts to founders are company pay — they must NOT reduce the
 * founder's equity balance. Matches "salary" anywhere in the category or
 * description so older records are classified correctly too.
 */
export function isFounderSalary(tx: Transaction): boolean {
  if (tx.type !== "founder_withdrawal" && tx.type !== "expense") return false;
  return (
    Boolean(tx.relatedFounderId) &&
    /salary|payroll/i.test(`${tx.category ?? ""} ${tx.description ?? ""}`)
  );
}
