import { describe, expect, it } from "vitest";
import {
  archiveLead,
  computeLeadCrmStats,
  decodeLeadNotesFromStorage,
  encodeLeadNotesForStorage,
  normalizeArchivedAt,
  reopenLostLead,
  visibleLeadsForBoard,
} from "./lead-stats";
import type { Lead, OperationsData, Project } from "./types";

function lead(partial: Partial<Lead> & Pick<Lead, "id" | "company" | "status">): Lead {
  return {
    createdAt: "2026-07-01",
    ...partial,
  };
}

describe("lead archive stats", () => {
  it("keeps lost count and win rate after archiving a lost deal", () => {
    const leads: Lead[] = [
      lead({ id: "w1", company: "Won Co", status: "won", expectedRevenue: 100_000 }),
      lead({ id: "l1", company: "Motosouls", status: "lost", expectedRevenue: 50_000 }),
    ];
    const before = computeLeadCrmStats(leads);
    expect(before.lostDeals).toBe(1);
    expect(before.wonCount).toBe(1);
    expect(before.conversionRate).toBe(50);

    const afterArchive = leads.map((l) => (l.id === "l1" ? archiveLead(l, "2026-07-25") : l));
    const after = computeLeadCrmStats(afterArchive);
    expect(after.lostDeals).toBe(1);
    expect(after.wonCount).toBe(1);
    expect(after.conversionRate).toBe(50);
    expect(visibleLeadsForBoard(afterArchive).map((l) => l.id)).toEqual(["w1"]);
  });

  it("excludes archived open deals from pipeline but keeps average deal size", () => {
    const leads: Lead[] = [
      lead({
        id: "open1",
        company: "Open Co",
        status: "negotiation",
        expectedRevenue: 80_000,
        probability: 50,
      }),
      lead({ id: "won1", company: "Won Co", status: "won", expectedRevenue: 100_000 }),
    ];
    const before = computeLeadCrmStats(leads);
    expect(before.pipelineValue).toBe(80_000);
    expect(before.averageDealSize).toBe(90_000);

    const archived = leads.map((l) => (l.id === "open1" ? archiveLead(l, "2026-07-25") : l));
    const after = computeLeadCrmStats(archived);
    expect(after.pipelineValue).toBe(0);
    expect(after.activeCount).toBe(0);
    expect(after.averageDealSize).toBe(90_000);
    expect(visibleLeadsForBoard(archived)).toHaveLength(1);
  });

  it("archiving a won lead does not remove linked projects", () => {
    const won = lead({
      id: "lead-won",
      company: "Acme",
      status: "won",
      expectedRevenue: 120_000,
      convertedClientId: "cli-acme",
    });
    const project: Project = {
      id: "proj-lead-lead-won",
      client: "Acme",
      clientId: "cli-acme",
      leadId: "lead-won",
      name: "Acme",
      status: "active",
    };
    const ops: OperationsData = {
      projects: [project],
      partnerships: [],
      expenses: [],
      leads: [won],
      clients: [],
    };

    const archived = archiveLead(won, "2026-07-25");
    const next: OperationsData = {
      ...ops,
      leads: [archived],
      // Projects intentionally untouched — same as LeadsPage.handleRemove
    };

    expect(next.projects).toHaveLength(1);
    expect(next.projects[0].leadId).toBe("lead-won");
    expect(next.projects[0].status).toBe("active");
    expect(visibleLeadsForBoard(next.leads ?? [])).toHaveLength(0);
    expect(computeLeadCrmStats(next.leads ?? []).wonCount).toBe(1);
  });

  it("rejects invalid archivedAt values", () => {
    const base = lead({ id: "x", company: "X", status: "lost" });
    expect(archiveLead(base, "not-a-date").archivedAt).toBeUndefined();
    expect(normalizeArchivedAt("2026-13-99")).toBeUndefined();
    expect(normalizeArchivedAt("2026-07-25T12:00:00Z")).toBe("2026-07-25");
  });
});

describe("lead notes archivedAt encoding", () => {
  it("round-trips archivedAt through notes storage", () => {
    const encoded = encodeLeadNotesForStorage("Hot deal", "2026-07-25");
    expect(encoded).toBe("[archivedAt:2026-07-25] Hot deal");
    expect(decodeLeadNotesFromStorage(encoded)).toEqual({
      archivedAt: "2026-07-25",
      notes: "Hot deal",
    });
  });

  it("encodes archive-only notes", () => {
    expect(encodeLeadNotesForStorage(undefined, "2026-07-25")).toBe("[archivedAt:2026-07-25]");
    expect(decodeLeadNotesFromStorage("[archivedAt:2026-07-25]")).toEqual({
      archivedAt: "2026-07-25",
      notes: undefined,
    });
  });
});

describe("reopen lost lead", () => {
  it("returns the same cycle to negotiation and drops the loss from win rate", () => {
    const lost = lead({
      id: "l1",
      company: "Blue Blocks",
      status: "lost",
      expectedRevenue: 50_000,
      archivedAt: "2026-07-10",
      notes: "Budget delay",
    });
    const won = lead({ id: "w1", company: "Won Co", status: "won", expectedRevenue: 100_000 });
    expect(computeLeadCrmStats([won, lost]).conversionRate).toBe(50);

    const reopened = reopenLostLead(lost, "2026-08-18");
    expect(reopened.status).toBe("negotiation");
    expect(reopened.archivedAt).toBeUndefined();
    expect(reopened.notes).toContain("Budget delay");
    expect(reopened.notes).toContain("Reopened after lost on 2026-08-18.");
    expect(reopened.id).toBe(lost.id);

    const after = computeLeadCrmStats([won, reopened]);
    expect(after.lostDeals).toBe(0);
    expect(after.wonCount).toBe(1);
    expect(after.conversionRate).toBe(100);
    expect(after.activeCount).toBe(1);
    expect(visibleLeadsForBoard([won, reopened]).map((item) => item.id)).toEqual(["w1", "l1"]);
  });

  it("does not reopen a deal that is not lost", () => {
    const open = lead({ id: "n1", company: "Open Co", status: "negotiation" });
    expect(reopenLostLead(open, "2026-08-18")).toBe(open);
  });
});
