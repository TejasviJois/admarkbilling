import { describe, expect, it } from "vitest";
import {
  formatInvoiceNumber,
  isInvoiceNumberUniqueViolation,
  nextInvoiceNumberFromList,
  reassignInvoiceNumberOnConflict,
} from "./invoice-number";

describe("invoice number uniqueness helpers", () => {
  it("detects Postgres unique_violation on the invoice number index", () => {
    expect(
      isInvoiceNumberUniqueViolation({
        code: "23505",
        message: 'duplicate key value violates unique constraint "invoices_payload_number_uidx"',
      }),
    ).toBe(true);

    expect(
      isInvoiceNumberUniqueViolation({
        code: "23505",
        message: "duplicate key value violates unique constraint",
        details: "Key ((payload ->> 'number'))=(AM/26-27/0001) already exists.",
      }),
    ).toBe(true);

    expect(isInvoiceNumberUniqueViolation({ code: "23503", message: "fk" })).toBe(false);
    expect(isInvoiceNumberUniqueViolation(null)).toBe(false);
  });

  it("reassigns the next FY sequence when a concurrent save took the same number", () => {
    const colliding = {
      id: "inv-b",
      number: "AM/26-27/0002",
      date: "2026-07-19",
    };
    // Peer inv-a already committed 0002 (the number we also tried to use).
    const existing = [
      { id: "inv-a", number: "AM/26-27/0001" },
      { id: "inv-a-winner", number: "AM/26-27/0002" },
      { id: "inv-b", number: "AM/26-27/0002" }, // stale self row if any
    ];

    const next = reassignInvoiceNumberOnConflict(colliding, existing);
    expect(next).toBe("AM/26-27/0003");
    expect(next).not.toBe(colliding.number);
  });

  it("never returns a number already held by another invoice after conflict", () => {
    const fy = "26-27";
    const peers = Array.from({ length: 5 }, (_, i) => ({
      id: `peer-${i + 1}`,
      number: formatInvoiceNumber(i + 1, fy),
    }));
    // Simulate race: client thought next was 0003, but peers already have 0001–0005.
    const attempted = { id: "new-inv", number: formatInvoiceNumber(3, fy), date: "2026-08-01" };
    const assigned = reassignInvoiceNumberOnConflict(attempted, peers);
    expect(assigned).toBe(formatInvoiceNumber(6, fy));
    expect(peers.every((p) => p.number !== assigned)).toBe(true);
    expect(assigned).toBe(nextInvoiceNumberFromList(peers, attempted.date));
  });
});
