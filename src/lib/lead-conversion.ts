import type { Client, Contact, Lead, LeadStatus, OperationsData, Project } from "./types";

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
  if (lead.convertedClientId) {
    const byId = clients.find((client) => client.id === lead.convertedClientId);
    if (byId) return byId;
  }
  const names = [lead.company, lead.name, lead.contactPerson].map(normalize).filter(Boolean);
  return clients.find((client) => names.includes(normalize(client.companyName)));
}

/** Find the pipeline lead matching a directory client (won/lost leads don't count as "in pipeline"). */
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

/** Build a new pipeline lead from a directory contact (contacted → Leads). */
export function leadFromContact(contact: Contact): Lead {
  return {
    id: `lead-${crypto.randomUUID().slice(0, 8)}`,
    name: contact.personName,
    company: contact.companyName || contact.personName,
    contactPerson: contact.personName,
    phone: contact.phone || undefined,
    notes: contact.contactVia ? `Contact via ${contact.contactVia}` : undefined,
    status: "new_lead",
    source: "Directory",
    createdAt: new Date().toISOString().slice(0, 10),
  };
}

const DISCUSSION_STATUSES: readonly LeadStatus[] = [
  "meeting_scheduled",
  "proposal_sent",
  "negotiation",
];

function needsDiscussionProject(status: LeadStatus): boolean {
  return DISCUSSION_STATUSES.includes(status) || status === "won" || status === "lost";
}

function projectStatusForLead(status: LeadStatus): Project["status"] | null {
  if (DISCUSSION_STATUSES.includes(status)) return "planning";
  if (status === "won") return "active";
  if (status === "lost") return "cancelled";
  return null;
}

/**
 * Match priority for the one primary project belonging to a lead:
 * 1. Project.leadId
 * 2. Project.clientId (via converted/matching client)
 * 3. Same company name (fallback)
 */
export function findProjectForLead(
  projects: Project[],
  lead: Lead,
  clientId?: string,
): Project | undefined {
  const byLead = projects.find((project) => project.leadId === lead.id);
  if (byLead) return byLead;

  if (clientId) {
    const byClient = projects.find((project) => project.clientId === clientId);
    if (byClient) return byClient;
  }

  const company = normalize(leadDisplayName(lead));
  if (!company) return undefined;
  return projects.find(
    (project) => normalize(project.client) === company || normalize(project.name) === company,
  );
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

function buildDiscussionProject(lead: Lead, clientId?: string): Project {
  const companyName = leadDisplayName(lead);
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: `proj-${crypto.randomUUID().slice(0, 8)}`,
    leadId: lead.id,
    clientId,
    client: companyName,
    name: companyName,
    status: "planning",
    startDate: today,
    phone: lead.phone,
    email: lead.email,
    notes: lead.notes
      ? `Created from lead pipeline. ${lead.notes}`
      : "Created from lead pipeline (Meeting Scheduled).",
    assignedMembers: lead.assignedSalesperson ? [lead.assignedSalesperson] : undefined,
    billing:
      lead.expectedRevenue != null && lead.expectedRevenue > 0
        ? { contractValue: lead.expectedRevenue }
        : undefined,
  };
}

/**
 * Pure lifecycle synchronizer: keeps one primary project in sync with lead status.
 *
 * - New Lead / Contacted: no automatic project
 * - Meeting Scheduled / Proposal Sent / Negotiation: project stays In discussions (planning)
 * - Won: create/reactivate client, attach project, move to Ongoing (active)
 * - Lost: keep same project, move to Not interested (cancelled)
 *
 * Never recreates a matched project; only patches lifecycle-owned fields.
 */
export function syncLeadLifecycle(ops: OperationsData, lead: Lead): OperationsData {
  let next: OperationsData = {
    ...ops,
    leads: (ops.leads ?? []).map((entry) => (entry.id === lead.id ? lead : entry)),
  };

  if (!needsDiscussionProject(lead.status)) {
    return next;
  }

  const targetStatus = projectStatusForLead(lead.status);
  if (!targetStatus) return next;

  let clientId = lead.convertedClientId ?? findClientForLead(next.clients ?? [], lead)?.id;

  if (lead.status === "won") {
    next = ensureClientForWonLead(next, lead);
    const client = findClientForLead(next.clients ?? [], lead);
    clientId = client?.id;
    next = {
      ...next,
      leads: (next.leads ?? []).map((entry) =>
        entry.id === lead.id
          ? { ...entry, convertedClientId: clientId ?? entry.convertedClientId }
          : entry,
      ),
    };
  }

  const projects = next.projects ?? [];
  const matched = findProjectForLead(projects, lead, clientId);

  if (!matched) {
    // Only create when entering a stage that needs a project; never for New/Contacted.
    const created = buildDiscussionProject(
      { ...lead, convertedClientId: clientId ?? lead.convertedClientId },
      lead.status === "won" ? clientId : undefined,
    );
    created.status = targetStatus;
    if (lead.status === "won" && clientId) {
      created.clientId = clientId;
      created.client = leadDisplayName(lead);
    }
    return { ...next, projects: [created, ...projects] };
  }

  // Patch only lifecycle-owned fields — preserve billing, payments, milestones, etc.
  const patched: Project = {
    ...matched,
    leadId: matched.leadId ?? lead.id,
    status: targetStatus,
    phone: matched.phone || lead.phone,
    email: matched.email || lead.email,
  };

  if (clientId) {
    patched.clientId = matched.clientId ?? clientId;
    if (!matched.client?.trim()) patched.client = leadDisplayName(lead);
  }

  if (
    lead.expectedRevenue != null &&
    lead.expectedRevenue > 0 &&
    matched.billing?.contractValue == null
  ) {
    patched.billing = { ...matched.billing, contractValue: lead.expectedRevenue };
  }

  if (
    lead.assignedSalesperson &&
    !(matched.assignedMembers ?? []).includes(lead.assignedSalesperson) &&
    matched.assignedPartner !== lead.assignedSalesperson
  ) {
    patched.assignedMembers = [
      ...(matched.assignedMembers ?? (matched.assignedPartner ? [matched.assignedPartner] : [])),
      lead.assignedSalesperson,
    ];
  }

  return {
    ...next,
    projects: projects.map((project) => (project.id === matched.id ? patched : project)),
  };
}
