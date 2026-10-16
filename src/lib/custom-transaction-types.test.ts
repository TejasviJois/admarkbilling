import { describe, it, expect } from "vitest";
import { parseTransaction } from "@/server/operations-fns";
import type { Transaction } from "@/lib/types";

describe("Custom Transaction Types", () => {
  it("preserves customType in parseTransaction", () => {
    const rawTx: Transaction = {
      id: "tx-test-custom-1",
      type: "client_payment",
      customType: "Brand Sponsorship",
      date: "2026-10-16",
      amount: 45000,
      description: "Q4 Creator Partnership Deal",
      category: "Client Income",
      paymentMethod: "bank_transfer",
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    };

    const parsed = parseTransaction(rawTx);
    expect(parsed).not.toBeNull();
    expect(parsed?.customType).toBe("Brand Sponsorship");
    expect(parsed?.type).toBe("client_payment");
    expect(parsed?.amount).toBe(45000);
  });

  it("handles customType roundtrip encoding in notes for database compatibility", () => {
    const customType = "Affiliate Royalty";
    const userNotes = "Quarterly commission from software affiliate program.";

    // Simulating relational-write-repository encoding
    const encodedNotes = `${userNotes}\n\n[custom_type:${customType}]`;
    expect(encodedNotes).toContain(`[custom_type:${customType}]`);

    // Simulating relational-read-repository decoding
    const match = encodedNotes.match(/\[custom_type:([^\]]+)\]/);
    expect(match).not.toBeNull();
    expect(match![1]).toBe(customType);

    const cleanedNotes = encodedNotes.replace(/\[custom_type:[^\]]+\]/g, "").trim();
    expect(cleanedNotes).toBe(userNotes);
  });
});
