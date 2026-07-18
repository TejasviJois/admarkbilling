import type { Client, OperationsData, Project } from "./types";

const PRAJWAL_ID = "cli-relationship-prajwal";
const PRASHANTH_ID = "cli-relationship-prashanth-uncle";

function normalize(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function relationshipClient(id: string, name: string): Client {
  return {
    id,
    companyName: name,
    contactPerson: name,
    phone: "",
    email: "",
    billingAddress: "",
    clientSince: "2026-01-01",
    status: "active",
    notes: "Relationship account — billing remains separated by company.",
  };
}

function projectMatchesClient(project: Project, client: Client): boolean {
  return (
    project.clientId === client.id || normalize(project.client) === normalize(client.companyName)
  );
}

/**
 * Build relationship-level client accounts without merging company finances.
 * Child companies retain their own ids and remain the billing entities.
 */
export function withDefaultClientHierarchy(data: OperationsData): OperationsData {
  let clients = [...(data.clients ?? [])];
  let projects = [...data.projects];

  if (!clients.some((client) => client.id === PRAJWAL_ID)) {
    clients.push(relationshipClient(PRAJWAL_ID, "Prajwal"));
  }
  if (!clients.some((client) => client.id === PRASHANTH_ID)) {
    clients.push(relationshipClient(PRASHANTH_ID, "Prashanth Uncle"));
  }

  const prajwalCompanies = new Set([
    "kapila faq",
    "kapila management software",
    "safe wheels",
    "spice trip",
  ]);

  clients = clients.map((client) => {
    const name = normalize(client.companyName);
    if (prajwalCompanies.has(name)) return { ...client, parentClientId: PRAJWAL_ID };
    if (name === "mtm faq") return { ...client, parentClientId: PRASHANTH_ID };
    return client;
  });

  // Existing live data uses Prashanth's name as the Rent Management company.
  // Rename only that billing child; the relationship parent remains "Prashanth Uncle".
  const rentProject = projects.find((project) => {
    const label = `${normalize(project.client)} ${normalize(project.projectType)}`;
    return label.includes("rent management") || label.includes("prashanth unlce");
  });
  let rentClient = clients.find((client) => {
    if (client.id === PRASHANTH_ID) return false;
    const name = normalize(client.companyName);
    return (
      name.includes("prashanth uncle") ||
      name.includes("prashanth unlce") ||
      (rentProject ? projectMatchesClient(rentProject, client) : false)
    );
  });

  if (!rentClient && rentProject) {
    rentClient = {
      id: rentProject.clientId ?? "cli-rent-management",
      companyName: "Rent Management",
      contactPerson: "Prashanth Uncle",
      phone: rentProject.phone ?? "",
      email: rentProject.email ?? "",
      billingAddress: "",
      clientSince: rentProject.startDate ?? "2026-01-01",
      status: "active",
      parentClientId: PRASHANTH_ID,
    };
    clients.push(rentClient);
  }

  if (rentClient) {
    const oldName = rentClient.companyName;
    clients = clients.map((client) =>
      client.id === rentClient.id
        ? {
            ...client,
            companyName: "Rent Management",
            contactPerson: client.contactPerson || "Prashanth Uncle",
            parentClientId: PRASHANTH_ID,
          }
        : client,
    );
    projects = projects.map((project) =>
      project.clientId === rentClient.id || normalize(project.client) === normalize(oldName)
        ? { ...project, clientId: rentClient.id, client: "Rent Management" }
        : project,
    );
  }

  return { ...data, clients, projects };
}

export function childCompanies(clients: Client[], parentId: string): Client[] {
  return clients
    .filter((client) => client.parentClientId === parentId)
    .sort((a, b) => a.companyName.localeCompare(b.companyName));
}

export function isRelationshipClient(clients: Client[], clientId: string): boolean {
  return clients.some((client) => client.parentClientId === clientId);
}
