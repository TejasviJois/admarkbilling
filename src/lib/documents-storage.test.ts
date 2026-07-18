import { describe, expect, it } from "vitest";
import type { Agreement, ArchiveDocument, DocumentsData } from "./types";
import { applyDocumentsMutation } from "./documents-storage";

function agreement(id: string, title: string): Agreement {
  return {
    id,
    title,
    counterpartyName: "Acme Corp",
    counterpartyType: "client",
    createdAt: 1,
    updatedAt: 1,
  };
}

function archiveDocument(id: string, title: string): ArchiveDocument {
  return {
    id,
    title,
    documentType: "proposal",
    clientId: "cli-acme",
    clientName: "Acme Corp",
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("applyDocumentsMutation", () => {
  it("replays upserts on latest without touching server-only rows", () => {
    const latest: DocumentsData = {
      agreements: [agreement("a1", "Original"), agreement("a2", "Added in another tab")],
      archiveDocuments: [archiveDocument("d1", "Server upload")],
    };
    const merged = applyDocumentsMutation(latest, {
      upserts: { agreements: [agreement("a1", "Renamed locally")] },
      deletes: {},
    });

    expect(merged.agreements.map((a) => a.title).sort()).toEqual([
      "Added in another tab",
      "Renamed locally",
    ]);
    expect(merged.archiveDocuments).toEqual(latest.archiveDocuments);
  });

  it("applies only explicit deletes and preserves everything else", () => {
    const latest: DocumentsData = {
      agreements: [agreement("a1", "Keep me")],
      archiveDocuments: [archiveDocument("d1", "Delete me"), archiveDocument("d2", "Keep me too")],
    };
    const merged = applyDocumentsMutation(latest, {
      upserts: {},
      deletes: { archiveDocuments: ["d1"] },
    });

    expect(merged.agreements).toEqual(latest.agreements);
    expect(merged.archiveDocuments.map((d) => d.id)).toEqual(["d2"]);
  });

  it("adds new local uploads on top of newer server state", () => {
    const latest: DocumentsData = {
      agreements: [],
      archiveDocuments: [archiveDocument("d-server", "From other tab")],
    };
    const merged = applyDocumentsMutation(latest, {
      upserts: { archiveDocuments: [archiveDocument("d-local", "My upload")] },
      deletes: {},
    });

    expect(merged.archiveDocuments.map((d) => d.id).sort()).toEqual(["d-local", "d-server"]);
  });
});
