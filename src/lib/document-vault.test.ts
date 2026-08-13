import { describe, expect, it } from "vitest";
import type { ArchiveDocument, Client, OperationsData } from "./types";
import {
  admarkVaultDocuments,
  clientFolders,
  documentsForCompany,
  ensureClientForCompany,
  groupByCompany,
  inferDocumentLibrary,
  normalizeArchiveDocument,
  proceedCompanyToClient,
} from "./document-vault";

function doc(
  partial: Partial<ArchiveDocument> & Pick<ArchiveDocument, "id" | "title">,
): ArchiveDocument {
  return {
    documentType: "other",
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  };
}

describe("document vault", () => {
  it("infers client library from older rows that already have a clientId", () => {
    expect(
      inferDocumentLibrary({
        documentType: "proposal",
        clientId: "cli-motorola",
      }),
    ).toBe("client");
  });

  it("keeps pre-client proposals in the proposals folder", () => {
    const normalized = normalizeArchiveDocument(
      doc({
        id: "d1",
        title: "Motorola proposal",
        documentType: "proposal",
        companyName: "Motorola",
      }),
    );
    expect(normalized.library).toBe("proposals");
    expect(normalized.companyName).toBe("Motorola");
    expect(normalized.clientId).toBeUndefined();
  });

  it("groups proposal and quotation files for the same company into one folder", () => {
    const folders = groupByCompany(
      [
        doc({
          id: "a",
          title: "Proposal",
          documentType: "proposal",
          library: "proposals",
          companyName: "Motorola",
          updatedAt: 2,
        }),
        doc({
          id: "b",
          title: "Quote",
          documentType: "quotation",
          library: "quotations",
          companyName: "motorola",
          updatedAt: 5,
        }),
      ].filter((d) => d.library !== "client"),
    );
    expect(folders).toHaveLength(1);
    expect(folders[0]?.count).toBe(2);
  });

  it("creates a CRM client on proceed when none exists, then moves quote and proposal files", () => {
    const ops: OperationsData = { projects: [], partnerships: [], expenses: [] };
    const { client, ops: nextOps, created } = ensureClientForCompany(ops, "Motorola");
    expect(created).toBe(true);
    expect(client.companyName).toBe("Motorola");
    expect(nextOps.clients).toHaveLength(1);

    const moved = proceedCompanyToClient(
      [
        doc({
          id: "q1",
          title: "Quote",
          documentType: "quotation",
          library: "quotations",
          companyName: "Motorola",
        }),
        doc({
          id: "p1",
          title: "Proposal",
          documentType: "proposal",
          library: "proposals",
          companyName: "Motorola",
        }),
        doc({
          id: "other",
          title: "Someone else",
          documentType: "quotation",
          library: "quotations",
          companyName: "Acme",
        }),
      ],
      "Motorola",
      client,
    );

    expect(moved.find((d) => d.id === "q1")?.library).toBe("client");
    expect(moved.find((d) => d.id === "p1")?.clientId).toBe(client.id);
    expect(moved.find((d) => d.id === "other")?.library).toBe("quotations");
    expect(documentsForCompany(moved, "Motorola")).toHaveLength(0);
    expect(clientFolders(moved, nextOps.clients ?? [])).toEqual([
      expect.objectContaining({ clientId: client.id, name: "Motorola", count: 2 }),
    ]);
  });

  it("reuses an existing CRM client instead of duplicating", () => {
    const existing: Client = {
      id: "cli-motorola",
      companyName: "Motorola",
      contactPerson: "Priya",
      phone: "",
      email: "",
      billingAddress: "",
      clientSince: "2024-01-01",
      status: "inactive",
    };
    const { client, created } = ensureClientForCompany(
      { projects: [], partnerships: [], expenses: [], clients: [existing] },
      "motorola",
    );
    expect(created).toBe(false);
    expect(client.id).toBe("cli-motorola");
    expect(client.status).toBe("active");
  });

  it("keeps Admark vault files in the vault when a company named Admark is proceeded", () => {
    const { client } = ensureClientForCompany(
      { projects: [], partnerships: [], expenses: [] },
      "Admark",
    );
    const moved = proceedCompanyToClient(
      [
        doc({
          id: "sop",
          title: "Onboarding SOP",
          library: "vault",
          companyName: "Admark",
        }),
        doc({
          id: "p1",
          title: "Admark proposal",
          documentType: "proposal",
          library: "proposals",
          companyName: "Admark",
        }),
      ],
      "Admark",
      client,
    );

    expect(moved.find((d) => d.id === "sop")?.library).toBe("vault");
    expect(moved.find((d) => d.id === "sop")?.clientId).toBeUndefined();
    expect(moved.find((d) => d.id === "p1")?.library).toBe("client");
    expect(admarkVaultDocuments(moved).map((d) => d.id)).toEqual(["sop"]);
  });
});
