import { entitySlug } from "./document-slug";
import type {
  ArchiveDocument,
  ArchiveDocumentType,
  Client,
  CompanyMember,
  DocumentLibrary,
  OperationsData,
  Project,
} from "./types";

export const ARCHIVE_DOCUMENT_TYPES: readonly ArchiveDocumentType[] = [
  "proposal",
  "quotation",
  "agreement",
  "technical",
  "handover",
  "write_off",
  "annexure",
  "other",
];

export const DOCUMENT_TYPE_LABEL: Record<ArchiveDocumentType, string> = {
  proposal: "Proposal",
  quotation: "Quotation",
  agreement: "Agreement",
  technical: "Technical",
  handover: "Handover",
  write_off: "Write-off",
  annexure: "Annexure",
  other: "Other",
};

export const CLIENT_FOLDER_SECTIONS: {
  type: ArchiveDocumentType;
  title: string;
  description: string;
}[] = [
  { type: "proposal", title: "Proposals", description: "Moved here when you Proceed." },
  { type: "quotation", title: "Quotations", description: "Moved here when you Proceed." },
  { type: "agreement", title: "Agreements", description: "Contracts, MOUs, and NDAs you upload." },
  { type: "technical", title: "Technical", description: "Specs and technical notes for delivery." },
  { type: "handover", title: "Handover", description: "Go-live and handover packs." },
  { type: "write_off", title: "Write-off", description: "Write-off letters and related files." },
  { type: "annexure", title: "Annexures", description: "Feature lists and contract annexures." },
  { type: "other", title: "Other", description: "Anything that does not fit a section above." },
];

export function isArchiveDocumentType(value: unknown): value is ArchiveDocumentType {
  return typeof value === "string" && (ARCHIVE_DOCUMENT_TYPES as readonly string[]).includes(value);
}

export function isDocumentLibrary(value: unknown): value is DocumentLibrary {
  return (
    value === "preclient" ||
    value === "proposals" ||
    value === "quotations" ||
    value === "client" ||
    value === "vault"
  );
}

export function isPreClientLibrary(library: DocumentLibrary | undefined): boolean {
  return library === "preclient" || library === "proposals" || library === "quotations";
}

export function normalizeCompanyName(name: string | undefined): string {
  return (name ?? "").trim().replace(/\s+/g, " ");
}

export function sameCompany(a: string | undefined, b: string | undefined): boolean {
  return normalizeCompanyName(a).toLowerCase() === normalizeCompanyName(b).toLowerCase();
}

export function companyFolderKey(name: string): string {
  return entitySlug(normalizeCompanyName(name));
}

export function newArchiveDocumentId(): string {
  return `doc_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function inferDocumentLibrary(
  doc: Pick<ArchiveDocument, "library" | "clientId" | "documentType">,
): DocumentLibrary {
  if (isDocumentLibrary(doc.library)) return doc.library;
  if (doc.clientId) return "client";
  if (doc.documentType === "proposal") return "proposals";
  if (doc.documentType === "quotation") return "quotations";
  return "client";
}

export function normalizeArchiveDocument(doc: ArchiveDocument): ArchiveDocument {
  const documentType = isArchiveDocumentType(doc.documentType) ? doc.documentType : "other";
  const companyName = normalizeCompanyName(doc.companyName || doc.clientName);
  const library = inferDocumentLibrary({ ...doc, documentType });
  const assignedMemberIds = Array.isArray(doc.assignedMemberIds)
    ? doc.assignedMemberIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : undefined;
  return {
    ...doc,
    documentType,
    companyName,
    clientName: doc.clientName || companyName,
    library,
    assignedMemberIds:
      assignedMemberIds && assignedMemberIds.length > 0 ? assignedMemberIds : undefined,
  };
}

export function vaultDocuments(docs: ArchiveDocument[] | undefined): ArchiveDocument[] {
  return (docs ?? []).map(normalizeArchiveDocument);
}

export function documentsInLibrary(
  docs: ArchiveDocument[] | undefined,
  library: DocumentLibrary,
): ArchiveDocument[] {
  return vaultDocuments(docs).filter((doc) => doc.library === library);
}

/** Proposals and quotations for a company live in one pre-client folder. */
export function preClientDocuments(docs: ArchiveDocument[] | undefined): ArchiveDocument[] {
  return vaultDocuments(docs).filter((doc) => isPreClientLibrary(doc.library));
}

export function documentsForCompany(
  docs: ArchiveDocument[] | undefined,
  companyName: string,
): ArchiveDocument[] {
  return preClientDocuments(docs)
    .filter((doc) => sameCompany(doc.companyName, companyName))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export const ADMARK_VAULT_COMPANY = "Admark";

export function admarkVaultDocuments(docs: ArchiveDocument[] | undefined): ArchiveDocument[] {
  return vaultDocuments(docs)
    .filter((doc) => doc.library === "vault")
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function documentsForClient(
  docs: ArchiveDocument[] | undefined,
  clientId: string,
): ArchiveDocument[] {
  return vaultDocuments(docs)
    .filter((doc) => doc.library === "client" && doc.clientId === clientId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export type CompanyFolder = {
  companyName: string;
  key: string;
  count: number;
  updatedAt: number;
};

export function groupByCompany(docs: ArchiveDocument[]): CompanyFolder[] {
  const groups = new Map<string, CompanyFolder>();
  for (const doc of docs) {
    const companyName = normalizeCompanyName(doc.companyName);
    if (!companyName) continue;
    const key = companyName.toLowerCase();
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.updatedAt = Math.max(existing.updatedAt, doc.updatedAt);
    } else {
      groups.set(key, {
        companyName,
        key: companyFolderKey(companyName),
        count: 1,
        updatedAt: doc.updatedAt,
      });
    }
  }
  return [...groups.values()].sort((a, b) => a.companyName.localeCompare(b.companyName));
}

export type ClientFolder = {
  clientId: string;
  name: string;
  count: number;
  updatedAt: number;
};

export function clientFolders(
  docs: ArchiveDocument[] | undefined,
  clients: Client[],
): ClientFolder[] {
  const folders = new Map<string, ClientFolder>();
  for (const doc of documentsInLibrary(docs, "client")) {
    if (!doc.clientId) continue;
    const existing = folders.get(doc.clientId);
    const name =
      clients.find((client) => client.id === doc.clientId)?.companyName ||
      normalizeCompanyName(doc.companyName || doc.clientName) ||
      "Unnamed client";
    if (existing) {
      existing.count += 1;
      existing.updatedAt = Math.max(existing.updatedAt, doc.updatedAt);
    } else {
      folders.set(doc.clientId, {
        clientId: doc.clientId,
        name,
        count: 1,
        updatedAt: doc.updatedAt,
      });
    }
  }
  return [...folders.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function documentTypeLabel(doc: ArchiveDocument): string {
  if (doc.documentType === "other" && doc.customType?.trim()) return doc.customType.trim();
  return DOCUMENT_TYPE_LABEL[doc.documentType] ?? "Document";
}

export function findClientForCompany(clients: Client[], companyName: string): Client | undefined {
  return clients.find((client) => sameCompany(client.companyName, companyName));
}

function slugClientId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug ? `cli-${slug}` : `cli-${crypto.randomUUID().slice(0, 8)}`;
}

/** Find or create a CRM client for a won quotation/proposal company. */
export function ensureClientForCompany(
  ops: OperationsData,
  companyName: string,
): { client: Client; ops: OperationsData; created: boolean } {
  const name = normalizeCompanyName(companyName);
  const clients = ops.clients ?? [];
  const existing = findClientForCompany(clients, name);
  if (existing) {
    if (existing.status === "active") return { client: existing, ops, created: false };
    const reactivated = { ...existing, status: "active" as const };
    return {
      client: reactivated,
      created: false,
      ops: {
        ...ops,
        clients: clients.map((client) => (client.id === existing.id ? reactivated : client)),
      },
    };
  }

  let id = slugClientId(name);
  while (clients.some((client) => client.id === id)) {
    id = `${id}-${crypto.randomUUID().slice(0, 4)}`;
  }
  const created: Client = {
    id,
    companyName: name,
    contactPerson: name,
    phone: "",
    email: "",
    billingAddress: "",
    clientSince: new Date().toISOString().slice(0, 10),
    status: "active",
    notes: "Created from Documents when a quotation or proposal was proceeded.",
  };
  return { client: created, created: true, ops: { ...ops, clients: [created, ...clients] } };
}

/**
 * Move this company's proposal and quotation files into the client folder.
 * Same rows — library becomes `client`; no duplicates.
 */
export function proceedCompanyToClient(
  docs: ArchiveDocument[],
  companyName: string,
  client: Client,
): ArchiveDocument[] {
  const now = Date.now();
  return vaultDocuments(docs).map((doc) => {
    if (doc.library === "client" || doc.library === "vault") return doc;
    if (!sameCompany(doc.companyName, companyName)) return doc;
    return {
      ...doc,
      library: "client",
      clientId: client.id,
      clientName: client.companyName,
      companyName: client.companyName,
      updatedAt: now,
    };
  });
}

export function projectsForClient(projects: Project[], client: Client): Project[] {
  return projects
    .filter(
      (project) =>
        project.clientId === client.id || sameCompany(project.client, client.companyName),
    )
    .sort((a, b) => (a.client || a.name || "").localeCompare(b.client || b.name || ""));
}

export function projectLabel(project: Project): string {
  const extra = project.projectType?.trim();
  const name = project.client?.trim() || project.name?.trim() || "Project";
  return extra ? `${name} · ${extra}` : name;
}

export function activeMembers(members: CompanyMember[] | undefined): CompanyMember[] {
  return (members ?? [])
    .filter((member) => member.status !== "inactive")
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function assigneeNames(
  assignedMemberIds: string[] | undefined,
  members: CompanyMember[],
): string[] {
  if (!assignedMemberIds?.length) return [];
  const byId = new Map(members.map((member) => [member.id, member.name]));
  return assignedMemberIds.map((id) => byId.get(id) ?? id);
}

export function displayDocumentDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp));
}
