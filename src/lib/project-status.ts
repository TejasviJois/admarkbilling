import type { ProjectStatus } from "./types";

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

export function projectStatusCounts(projects: { status: ProjectStatus }[]) {
  return {
    completed: projects.filter((p) => p.status === "completed").length,
    active: projects.filter((p) => p.status === "active").length,
    planning: projects.filter((p) => p.status === "planning").length,
    on_hold: projects.filter((p) => p.status === "on_hold").length,
    cancelled: projects.filter((p) => p.status === "cancelled").length,
  };
}
