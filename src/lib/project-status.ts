import type { Project, ProjectStatus } from "./types";

const STATUS_LABEL: Record<ProjectStatus, string> = {
  completed: "Done",
  active: "Ongoing",
  planning: "In discussions",
  on_hold: "On hold",
  cancelled: "Not interested",
};

export function projectStatusLabel(status: ProjectStatus): string {
  return STATUS_LABEL[status];
}

export function projectStatusBadgeClass(status: ProjectStatus): string {
  switch (status) {
    case "completed":
      return "bg-emerald-500/15 text-emerald-400";
    case "active":
      return "bg-emerald-500/15 text-emerald-300";
    case "planning":
      return "bg-sky-500/15 text-sky-400";
    case "on_hold":
      return "bg-rose-500/15 text-rose-400";
    case "cancelled":
      return "bg-rose-500/15 text-rose-300";
  }
}

export function projectClientLabel(p: { client?: string; name?: string }): string {
  return p.client?.trim() || p.name?.trim() || "—";
}

/** Ongoing and done projects count toward revenue booked — not in discussions, on hold, or cancelled. */
export const REVENUE_PROJECT_STATUSES: ProjectStatus[] = ["active", "completed"];

export function isRevenueProject(status: ProjectStatus): boolean {
  return REVENUE_PROJECT_STATUSES.includes(status);
}

/** All team members on a project — reads the new list with the legacy single owner as fallback. */
export function projectAssignedMemberIds(
  project: Pick<Project, "assignedMembers" | "assignedPartner">,
): string[] {
  if (project.assignedMembers?.length) return project.assignedMembers;
  return project.assignedPartner ? [project.assignedPartner] : [];
}

export function projectStatusCounts(projects: { status: ProjectStatus }[]) {
  return {
    completed: projects.filter((p) => p.status === "completed").length,
    active: projects.filter((p) => p.status === "active").length,
    planning: projects.filter((p) => p.status === "planning").length,
    on_hold: projects.filter((p) => p.status === "on_hold").length,
    cancelled: projects.filter((p) => p.status === "cancelled").length,
  };
}
