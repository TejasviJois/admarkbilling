import { describe, expect, it } from "vitest";
import { safeHref } from "./utils";
import { syncLeadLifecycle } from "./lead-conversion";
import type { OperationsData } from "./types";
import {
  UnsafeOperationsDeleteError,
  applyOperationsMutation,
  buildOperationsMutation,
} from "./operations-mutations";

describe("safeHref", () => {
  it("allows http(s), mailto, and tel", () => {
    expect(safeHref("https://example.com/path")).toBe("https://example.com/path");
    expect(safeHref("http://example.com")).toBe("http://example.com");
    expect(safeHref("mailto:a@b.com")).toBe("mailto:a@b.com");
    expect(safeHref("tel:+911234567890")).toBe("tel:+911234567890");
  });

  it("blocks javascript and data URLs", () => {
    expect(safeHref("javascript:alert(1)")).toBeUndefined();
    expect(safeHref("data:text/html,<script>alert(1)</script>")).toBeUndefined();
    expect(safeHref("vbscript:msgbox(1)")).toBeUndefined();
  });

  it("returns undefined for empty values", () => {
    expect(safeHref("")).toBeUndefined();
    expect(safeHref(null)).toBeUndefined();
    expect(safeHref(undefined)).toBeUndefined();
    expect(safeHref("   ")).toBeUndefined();
  });
});

describe("lead lifecycle idempotency", () => {
  it("uses a deterministic project id so concurrent creates merge safely", () => {
    const lead = {
      id: "lead-acme",
      company: "Acme",
      status: "meeting_scheduled" as const,
      createdAt: "2026-07-19",
    };
    const empty: OperationsData = {
      projects: [],
      partnerships: [],
      expenses: [],
      leads: [lead],
      clients: [],
    };
    const first = syncLeadLifecycle(empty, lead);
    const second = syncLeadLifecycle(empty, lead);
    expect(first.projects[0].id).toBe("proj-lead-lead-acme");
    expect(first.projects[0].id).toBe(second.projects[0].id);

    // Simulating two tabs that both created the discussion project: applying
    // both upserts by id collapses to one project.
    const merged = applyOperationsMutation(first, {
      upserts: { projects: second.projects as never },
      deletes: {},
      sets: {},
    });
    expect(merged.projects).toHaveLength(1);
    expect(merged.projects[0].leadId).toBe("lead-acme");
  });
});

describe("invoice/payment explicit deletes", () => {
  it("requires deleteIds for payment and transaction cleanup", () => {
    const before: OperationsData = {
      projects: [],
      partnerships: [],
      expenses: [],
      payments: [
        {
          id: "pay-1",
          amount: 100,
          date: "2026-07-01",
          method: "upi",
          invoiceId: "inv-1",
        },
      ],
      transactions: [
        {
          id: "invoice-payment-pay-1",
          type: "client_payment",
          date: "2026-07-01",
          amount: 100,
          description: "Payment",
          category: "Client Income",
          paymentMethod: "upi",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };
    const after = { ...before, payments: [], transactions: [] };
    expect(() => buildOperationsMutation(before, after)).toThrow(UnsafeOperationsDeleteError);
    const mutation = buildOperationsMutation(before, after, {
      deleteIds: { payments: ["pay-1"], transactions: ["invoice-payment-pay-1"] },
    });
    expect(mutation.deletes.payments).toEqual(["pay-1"]);
    expect(mutation.deletes.transactions).toEqual(["invoice-payment-pay-1"]);
  });
});

describe("queued concurrent entity saves", () => {
  it("applies sequential mutations without losing either entity", () => {
    let server: OperationsData = {
      projects: [
        {
          id: "project-1",
          name: "Original",
          client: "Client",
          status: "planning",
          startDate: "2026-07-01",
        },
      ],
      partnerships: [],
      expenses: [],
      contacts: [
        {
          id: "contact-1",
          personName: "Original",
          companyName: "Co",
          createdAt: "2026-07-01",
        },
      ],
    };
    let version = 1;

    const save = (previous: OperationsData, next: OperationsData, expected: number) => {
      if (version !== expected) return { ok: false as const, version };
      const mutation = buildOperationsMutation(previous, next);
      server = applyOperationsMutation(server, mutation);
      version += 1;
      return { ok: true as const, version, data: server };
    };

    // Tab/queue item 1: update project against v1
    const afterProject = {
      ...server,
      projects: [{ ...server.projects[0], name: "Updated project" }],
    };
    expect(save(server, afterProject, 1).ok).toBe(true);

    // Queue item 2: was built against the optimistic cache that already includes
    // the project update, then applied with the advanced version.
    const afterBoth = {
      ...afterProject,
      contacts: [{ ...server.contacts![0], personName: "Updated contact" }],
    };
    const second = save(afterProject, afterBoth, 2);
    expect(second.ok).toBe(true);
    expect(server.projects[0].name).toBe("Updated project");
    expect(server.contacts![0].personName).toBe("Updated contact");
  });
});
