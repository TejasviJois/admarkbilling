import type { Client, OperationsData, Project } from "./types";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** Squashed form used for fuzzy matching — "Safe Wheels" and "Safewheels Group" both start with "safewheels". */
function squash(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Minimum squashed length before prefix matching applies, so short names can't false-match. */
const MIN_PREFIX_LENGTH = 6;

/**
 * Recreate client records that projects still reference but that vanished from
 * the client list (deleted or lost during renames). Keeps the original id so
 * the project link stays valid.
 */
export function ensureClientsForLinkedProjects(data: OperationsData): OperationsData {
  const clients = data.clients ?? [];
  const ids = new Set(clients.map((client) => client.id));
  const names = new Set(clients.map((client) => squash(client.companyName)));

  const restored: Client[] = [];
  for (const project of data.projects) {
    if (!project.clientId || ids.has(project.clientId)) continue;
    const name = (project.client || project.name || "").trim();
    // A same-named client already exists — repairProjectClientLinks re-pins it.
    if (!name || names.has(squash(name))) continue;
    restored.push({
      id: project.clientId,
      companyName: name,
      contactPerson: name,
      phone: project.phone ?? "",
      email: project.email ?? "",
      billingAddress: "",
      clientSince: project.startDate ?? new Date().toISOString().slice(0, 10),
      status: "active",
      notes: "Restored automatically — the project still referenced this client.",
    });
    ids.add(project.clientId);
    names.add(squash(name));
  }

  return restored.length > 0 ? { ...data, clients: [...clients, ...restored] } : data;
}

/**
 * Re-pin `project.clientId` for projects whose link is dangling (the client
 * was renamed or deleted and re-created). Matches by exact normalized name
 * first, then by squashed-name prefix for longer names. Projects with no
 * clientId at all are left alone — a deliberately unlinked project must not
 * get fuzzy-matched onto a similarly named client.
 */
export function repairProjectClientLinks(data: OperationsData): OperationsData {
  const clients = data.clients ?? [];
  if (clients.length === 0) return data;
  const clientIds = new Set(clients.map((client) => client.id));

  let changed = false;
  const projects = data.projects.map((project) => {
    if (!project.clientId || clientIds.has(project.clientId)) return project;
    const projectName = squash(project.client);
    if (!projectName) return project;

    const exact = clients.find((client) => squash(client.companyName) === projectName);
    const fuzzy =
      exact ??
      (projectName.length >= MIN_PREFIX_LENGTH
        ? clients.find((client) => {
            const clientName = squash(client.companyName);
            return (
              clientName.length >= MIN_PREFIX_LENGTH &&
              (clientName.startsWith(projectName) || projectName.startsWith(clientName))
            );
          })
        : undefined);

    if (!fuzzy) return project;
    changed = true;
    return { ...project, clientId: fuzzy.id };
  });

  return changed ? { ...data, projects } : data;
}

/**
 * After a client rename, keep its projects linked: pin `clientId` and update
 * the display name on every project that referenced the old company name.
 */
export function relinkProjectsAfterClientRename(
  projects: Project[],
  previous: Client,
  saved: Client,
): Project[] {
  const oldName = normalize(previous.companyName);
  return projects.map((project) => {
    const linked = project.clientId === saved.id || normalize(project.client) === oldName;
    if (!linked) return project;
    return { ...project, clientId: saved.id, client: saved.companyName };
  });
}
