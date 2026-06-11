import { Link } from "@tanstack/react-router";
import type { Project } from "@/lib/types";
import {
  projectClientLabel,
  projectStatusBadgeClass,
  projectStatusLabel,
} from "@/lib/project-status";
import { DataTable, RowDelete } from "./operations-ui";

export function ProjectsTable({
  projects,
  onRemove,
  showActions = true,
}: {
  projects: Project[];
  onRemove?: (id: string) => void;
  showActions?: boolean;
}) {
  const headers = showActions
    ? ["Client", "Project type", "Status", "Revenue", "Payment", ""]
    : ["Client", "Project type", "Status", "Revenue", "Payment"];

  return (
    <DataTable
      headers={headers}
      rows={projects.map((p) => {
        const cells: React.ReactNode[] = [
          projectClientLabel(p),
          p.projectType || "—",
          <ProjectStatusBadge key={`st-${p.id}`} status={p.status} />,
          p.revenueValue || (p.budget != null ? `₹${p.budget.toLocaleString("en-IN")}` : "—"),
          p.paymentStatus || "—",
        ];
        if (showActions && onRemove) {
          cells.push(<RowDelete key={`del-${p.id}`} onClick={() => onRemove(p.id)} />);
        }
        return cells;
      })}
    />
  );
}

export function ProjectStatusBadge({ status }: { status: Project["status"] }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${projectStatusBadgeClass(status)}`}
    >
      {projectStatusLabel(status)}
    </span>
  );
}

export function ProjectsPipelineSummary({ projects }: { projects: Project[] }) {
  const counts = {
    completed: projects.filter((p) => p.status === "completed").length,
    active: projects.filter((p) => p.status === "active").length,
    planning: projects.filter((p) => p.status === "planning").length,
    on_hold: projects.filter((p) => p.status === "on_hold").length,
    cancelled: projects.filter((p) => p.status === "cancelled").length,
  };

  const items = [
    { label: "Done", count: counts.completed, className: "text-emerald-400" },
    { label: "Ongoing", count: counts.active, className: "text-emerald-300" },
    { label: "In discussions", count: counts.planning, className: "text-sky-400" },
    { label: "On hold", count: counts.on_hold, className: "text-rose-400" },
    { label: "Cancelled", count: counts.cancelled, className: "text-rose-300" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border border-border bg-card px-4 py-3 text-center shadow-sm"
        >
          <p className={`text-2xl font-semibold tabular-nums ${item.className}`}>{item.count}</p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

export function ProjectsDashboardSection({ projects }: { projects: Project[] }) {
  const ongoing = projects.filter((p) => p.status === "active");

  return (
    <section className="space-y-5 rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Projects pipeline</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {projects.length} clients tracked across all stages.
          </p>
        </div>
        <Link
          to="/projects"
          className="text-sm font-medium text-primary hover:underline underline-offset-4"
        >
          View all
        </Link>
      </div>
      <ProjectsPipelineSummary projects={projects} />
      {ongoing.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Ongoing ({ongoing.length})</h3>
          <ProjectsTable projects={ongoing} showActions={false} />
        </div>
      )}
    </section>
  );
}
