import type { Client, Lead, OperationsData } from "./types";

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function slugId(prefix: string, name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug ? `${prefix}-${slug}` : `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

/** Display name for a directory entry / lead — company first, person as fallback. */
export function leadDisplayName(lead: Lead): string {
  return lead.company?.trim() || lead.name?.trim() || lead.contactPerson?.trim() || "Unnamed lead";
}

/** Find the client record matching a lead by company or person name. */
export function findClientForLead(clients: Client[], lead: Lead): Client | undefined {
  const names = [lead.company, lead.name, lead.contactPerson].map(normalize).filter(Boolean);
  return clients.find((client) => names.includes(normalize(client.companyName)));
}

/** Find the pipeline lead matching a directory contact (won/lost leads don't count as "in pipeline"). */
export function findLeadForClient(leads: Lead[], client: Client): Lead | undefined {
  const target = normalize(client.companyName);
  return leads.find((lead) =>
    [lead.company, lead.name, lead.contactPerson].some((value) => normalize(value) === target),
  );
}

/** Build a new pipeline lead from a directory contact. */
export function leadFromClient(client: Client): Lead {
  return {
    id: `lead-${crypto.randomUUID().slice(0, 8)}`,
    name: client.contactPerson || client.companyName,
    company: client.companyName,
    business: client.industry || undefined,
    contactPerson: client.contactPerson || undefined,
    email: client.email || undefined,
    phone: client.phone || undefined,
    notes: client.notes || undefined,
    status: "new_lead",
    source: "Directory",
    createdAt: new Date().toISOString().slice(0, 10),
  };
}

/**
 * When a lead is marked Won it graduates into the client roster.
 * Creates the client record if none matches; existing clients are reactivated.
 */
export function ensureClientForWonLead<T extends Pick<OperationsData, "clients">>(
  ops: T,
  lead: Lead,
): T {
  const clients = ops.clients ?? [];
  const existing = findClientForLead(clients, lead);
  if (existing) {
    if (existing.status === "active") return ops;
    return {
      ...ops,
      clients: clients.map((client) =>
        client.id === existing.id ? { ...client, status: "active" } : client,
      ),
    };
  }

  const companyName = leadDisplayName(lead);
  const created: Client = {
    id: slugId("cli", companyName),
    companyName,
    contactPerson: lead.contactPerson || lead.name || companyName,
    phone: lead.phone ?? "",
    email: lead.email ?? "",
    billingAddress: "",
    industry: lead.business || undefined,
    clientSince: new Date().toISOString().slice(0, 10),
    status: "active",
    notes: lead.notes ? `Converted from lead. ${lead.notes}` : "Converted from lead.",
  };
  return { ...ops, clients: [created, ...clients] };
}
