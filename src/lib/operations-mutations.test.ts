import { describe, expect, it } from "vitest";
import type { OperationsData } from "./types";
import {
  UnsafeOperationsDeleteError,
  applyOperationsMutation,
  buildOperationsMutation,
  rebaseOperationsPersist,
} from "./operations-mutations";

function baseOperations(): OperationsData {
  return {
    projects: [
      {
        id: "project-1",
        name: "Original project",
        client: "Client",
        projectType: "Website",
        status: "planning",
        priority: "medium",
        startDate: "2026-07-01",
        paymentStatus: "unpaid",
      },
    ],
    partnerships: [],
    expenses: [],
    contacts: [
      {
        id: "contact-1",
        personName: "Original contact",
        companyName: "Company",
        createdAt: "2026-07-01",
      },
    ],
    leads: [],
    clients: [],
    transactions: [],
  };
}

type SimulatedServer = {
  data: OperationsData;
  version: number;
};

function compareAndSwap(
  server: SimulatedServer,
  expectedVersion: number,
  nextMutation: ReturnType<typeof buildOperationsMutation>,
) {
  if (server.version !== expectedVersion) {
    return { ok: false as const, data: server.data, version: server.version };
  }
  server.data = applyOperationsMutation(server.data, nextMutation);
  server.version += 1;
  return { ok: true as const, data: server.data, version: server.version };
}

describe("safe operations mutations", () => {
  it("updates only the changed entity and never includes unrelated arrays", () => {
    const before = baseOperations();
    const next = {
      ...before,
      projects: [{ ...before.projects[0], name: "Updated project" }],
    };

    const mutation = buildOperationsMutation(before, next);

    expect(mutation.upserts.projects).toHaveLength(1);
    expect(mutation.upserts.contacts).toBeUndefined();
    expect(mutation.deletes).toEqual({});
    expect(applyOperationsMutation(before, mutation).contacts).toEqual(before.contacts);
  });

  it("rejects a stale empty array unless deletion was explicit", () => {
    const before = baseOperations();
    const staleEmptySnapshot = { ...before, projects: [] };

    expect(() => buildOperationsMutation(before, staleEmptySnapshot)).toThrow(
      UnsafeOperationsDeleteError,
    );
  });

  it("allows an explicit user delete without changing other entities", () => {
    const before = baseOperations();
    const next = { ...before, projects: [] };
    const mutation = buildOperationsMutation(before, next, {
      deleteIds: { projects: ["project-1"] },
    });
    const result = applyOperationsMutation(before, mutation);

    expect(result.projects).toEqual([]);
    expect(result.contacts).toEqual(before.contacts);
  });

  it("rejects a stale browser tab and preserves the newer server save", () => {
    const initial = baseOperations();
    const server: SimulatedServer = { data: initial, version: 1 };

    const tabA = {
      ...initial,
      projects: [{ ...initial.projects[0], name: "Saved by tab A" }],
    };
    const tabB = {
      ...initial,
      projects: [{ ...initial.projects[0], name: "Stale tab B" }],
    };

    expect(compareAndSwap(server, 1, buildOperationsMutation(initial, tabA)).ok).toBe(true);
    const staleResult = compareAndSwap(server, 1, buildOperationsMutation(initial, tabB));

    expect(staleResult.ok).toBe(false);
    expect(server.data.projects[0].name).toBe("Saved by tab A");
  });

  it("supports an explicit merge after concurrent tabs changed different entities", () => {
    const initial = baseOperations();
    const server: SimulatedServer = { data: initial, version: 1 };

    const tabA = {
      ...initial,
      projects: [{ ...initial.projects[0], name: "Project from tab A" }],
    };
    const tabB = {
      ...initial,
      contacts: [{ ...initial.contacts![0], personName: "Contact from tab B" }],
    };
    const tabBMutation = buildOperationsMutation(initial, tabB);

    compareAndSwap(server, 1, buildOperationsMutation(initial, tabA));
    const staleResult = compareAndSwap(server, 1, tabBMutation);
    expect(staleResult.ok).toBe(false);

    const merged = compareAndSwap(server, staleResult.version, tabBMutation);
    expect(merged.ok).toBe(true);
    expect(server.data.projects[0].name).toBe("Project from tab A");
    expect(server.data.contacts![0].personName).toBe("Contact from tab B");
  });

  it("rebases a second stale delete so the first delete is not resurrected", () => {
    const initial: OperationsData = {
      ...baseOperations(),
      leadList: [
        { id: "a", externalId: "1", title: "A", contacted: false, importedAt: "2026-01-01" },
        { id: "b", externalId: "2", title: "B", contacted: false, importedAt: "2026-01-01" },
        { id: "c", externalId: "3", title: "C", contacted: false, importedAt: "2026-01-01" },
      ],
    };

    // First click deletes A from a fresh snapshot.
    const afterDeleteA = {
      ...initial,
      leadList: initial.leadList!.filter((entry) => entry.id !== "a"),
    };
    const first = rebaseOperationsPersist(initial, afterDeleteA, initial, {
      deleteIds: { leadList: ["a"] },
    });
    expect(first.next.leadList?.map((e) => e.id)).toEqual(["b", "c"]);

    // Second click still closes over the original list and filters only B,
    // which would resurrect A if diffed against the latest cache directly.
    const staleSecondNext = {
      ...initial,
      leadList: initial.leadList!.filter((entry) => entry.id !== "b"),
    };
    const second = rebaseOperationsPersist(initial, staleSecondNext, first.next, {
      deleteIds: { leadList: ["b"] },
    });

    expect(second.mutation.deletes.leadList).toEqual(["b"]);
    expect(second.mutation.upserts.leadList).toBeUndefined();
    expect(second.next.leadList?.map((e) => e.id)).toEqual(["c"]);
  });
});
