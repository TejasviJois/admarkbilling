import { isRevenueProject } from "./project-status";
import type { Client, Project } from "./types";

export type ClientProjectCounts = {
  active: number;
  completed: number;
};

/** Parent company plus any child companies hanging off it. */
export function clientRelationshipMembers(client: Client, allClients: Client[]): Client[] {
  const children = allClients.filter((candidate) => candidate.parentClientId === client.id);
  return children.length > 0 ? [client, ...children] : [client];
}

/** Ongoing and completed projects for a client relationship (parent + children). */
export function projectsForClientRelationship(
  projects: Project[],
  client: Client,
  allClients: Client[],
): Project[] {
  const members = clientRelationshipMembers(client, allClients);
  const ids = new Set(members.map((member) => member.id));
  const names = new Set(
    members.map((member) => (member.companyName ?? "").trim().toLowerCase()).filter(Boolean),
  );
  return projects.filter(
    (project) =>
      isRevenueProject(project.status) &&
      ((project.clientId != null && ids.has(project.clientId)) ||
        names.has((project.client ?? "").trim().toLowerCase())),
  );
}

export function countClientProjects(projects: Pick<Project, "status">[]): ClientProjectCounts {
  return {
    active: projects.filter((project) => project.status === "active").length,
    completed: projects.filter((project) => project.status === "completed").length,
  };
}

/** e.g. "1 ongoing + 2 completed" */
export function formatProjectStatusCounts(counts: ClientProjectCounts): string {
  const parts: string[] = [];
  if (counts.active > 0) {
    parts.push(`${counts.active} ongoing`);
  }
  if (counts.completed > 0) {
    parts.push(`${counts.completed} completed`);
  }
  if (parts.length === 0) return "No projects";
  return parts.join(" + ");
}
