import type { Client, OperationsData, Project } from "./types";

function slugId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug ? `cli-${slug}` : `cli-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Links a project to its client record, creating the client when the typed
 * name is new — so a client added from the project dialog shows up everywhere
 * (CRM, income dropdowns, documents) without a separate step.
 */
export function resolveProjectClient(
  ops: OperationsData,
  project: Project,
): { project: Project; clients: Client[] } {
  const clients = ops.clients ?? [];
  const name = project.client.trim();
  if (!name) return { project, clients };

  // Already linked to a real client — nothing to do.
  if (project.clientId && clients.some((client) => client.id === project.clientId)) {
    return { project, clients };
  }

  const existing = clients.find(
    (client) => client.companyName.trim().toLowerCase() === name.toLowerCase(),
  );
  if (existing) {
    return { project: { ...project, clientId: existing.id }, clients };
  }

  let id = slugId(name);
  while (clients.some((client) => client.id === id)) {
    id = `${id}-${crypto.randomUUID().slice(0, 4)}`;
  }

  const created: Client = {
    id,
    companyName: name,
    contactPerson: name,
    phone: project.phone ?? "",
    email: project.email ?? "",
    billingAddress: "",
    clientSince: project.startDate || new Date().toISOString().slice(0, 10),
    status: "active",
  };

  return {
    project: { ...project, clientId: id },
    clients: [...clients, created],
  };
}
