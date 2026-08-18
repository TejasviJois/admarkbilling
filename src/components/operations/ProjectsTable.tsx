import { Link } from "@tanstack/react-router";
import type { Project } from "@/lib/types";
import { formatINRWhole } from "@/lib/invoice-calc";
import { paymentSummary } from "@/lib/project-payments";
import { resolveProjectBilling } from "@/lib/project-billing";
import {
  isRevenueProject,
  projectAssignedMemberIds,
  projectClientLabel,
  projectStatusBadgeClass,
  projectStatusLabel,
} from "@/lib/project-status";
import { DataTable, RowDelete, RowEdit, ContactLinks } from "./operations-ui";
import { useCompany } from "@/hooks/use-company";

export function ProjectsTable({
  projects,
  onEdit,
  onRemove,
  showActions = true,
  showOutstanding = true,
  /** Show monthly retainer rate alongside contract value (retainer segments). */
  emphasizeRetainer = false,
}: {
  projects: Project[];
  onEdit?: (project: Project) => void;
  onRemove?: (id: string) => void;
  showActions?: boolean;
  /** Outstanding only applies to revenue projects (done/ongoing) — hide it for pipeline views. */
  showOutstanding?: boolean;
  emphasizeRetainer?: boolean;
}) {
  const { company } = useCompany();
  const memberNames = (project: Project) => {
    const names = projectAssignedMemberIds(project)
      .map(
        (id) =>
          company.companyMembers
            ?.find((member) => member.id === id)
            ?.name.trim()
            .split(/\s+/)[0],
      )
      .filter(Boolean);
    return names.length ? names.join(", ") : "Unassigned";
  };
  const headers = [
    "Client",
    "Project",
    "Project type",
    "Team",
    "Status",
    "Contract value",
    ...(emphasizeRetainer ? ["Monthly retainer"] : []),
    ...(showOutstanding ? ["Outstanding"] : []),
    "Contact",
    ...(showActions ? ["Actions"] : []),
  ];

  return (
    <DataTable
      headers={headers}
      rows={projects.map((p) => {
        const { target, pending } = paymentSummary(p);
        const billing = resolveProjectBilling(p);
        const projectCell = (
          <span key={`project-${p.id}`} className="font-bold text-primary">
            {p.name?.trim() || projectClientLabel(p)}
          </span>
        );

        const cells: React.ReactNode[] = [
          p.client?.trim() || "—",
          projectCell,
          p.projectType || "—",
          memberNames(p),
          <ProjectStatusBadge key={`st-${p.id}`} status={p.status} />,
          target != null ? formatINRWhole(target) : "—",
        ];
        if (emphasizeRetainer) {
          cells.push(
            billing.monthlyAmount ? `${formatINRWhole(billing.monthlyAmount)}/month` : "—",
          );
        }
        if (showOutstanding) {
          cells.push(isRevenueProject(p.status) && pending != null ? formatINRWhole(pending) : "—");
        }
        cells.push(<ContactLinks key={`contact-${p.id}`} phone={p.phone} />);
        if (showActions) {
          cells.push(
            <div key={`actions-${p.id}`} className="flex items-center justify-end gap-1">
              {onEdit && <RowEdit onClick={() => onEdit(p)} />}
              {onRemove && <RowDelete onClick={() => onRemove(p.id)} />}
            </div>,
          );
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

export function ProjectsPipelineSummary({
  projects,
  selected,
  onSelect,
}: {
  projects: Project[];
  /** Currently active status filter — highlights that card. */
  selected?: Project["status"];
  /** When provided, cards become clickable filters. */
  onSelect?: (status: Project["status"]) => void;
}) {
  const counts = {
    completed: projects.filter((p) => p.status === "completed").length,
    active: projects.filter((p) => p.status === "active").length,
    planning: projects.filter((p) => p.status === "planning").length,
    on_hold: projects.filter((p) => p.status === "on_hold").length,
    cancelled: projects.filter((p) => p.status === "cancelled").length,
  };

  const items: { label: string; count: number; className: string; status: Project["status"] }[] = [
    { label: "Done", count: counts.completed, className: "text-emerald-400", status: "completed" },
    { label: "Ongoing", count: counts.active, className: "text-emerald-300", status: "active" },
    {
      label: "In discussions",
      count: counts.planning,
      className: "text-sky-400",
      status: "planning",
    },
    { label: "On hold", count: counts.on_hold, className: "text-rose-400", status: "on_hold" },
    {
      label: "Not interested",
      count: counts.cancelled,
      className: "text-rose-300",
      status: "cancelled",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => {
        const isActive = selected === item.status;
        const baseClass = "rounded-lg border px-4 py-3 text-center shadow-sm transition-colors";
        const toneClass = isActive
          ? "border-primary bg-primary/10 ring-1 ring-primary/40"
          : "border-border bg-card";
        if (!onSelect) {
          return (
            <div key={item.label} className={`${baseClass} ${toneClass}`}>
              <p className={`text-2xl font-semibold tabular-nums ${item.className}`}>
                {item.count}
              </p>
              <p className="mt-1 text-xs font-medium text-muted-foreground">{item.label}</p>
            </div>
          );
        }
        return (
          <button
            key={item.label}
            type="button"
            onClick={() => onSelect(item.status)}
            aria-pressed={isActive}
            className={`${baseClass} ${toneClass} cursor-pointer hover:border-primary/50 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50`}
          >
            <p className={`text-2xl font-semibold tabular-nums ${item.className}`}>{item.count}</p>
            <p
              className={`mt-1 text-xs font-medium ${isActive ? "text-foreground" : "text-muted-foreground"}`}
            >
              {item.label}
            </p>
          </button>
        );
      })}
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
