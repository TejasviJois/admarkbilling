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
          <Link
            key={`project-${p.id}`}
            to="/projects/$id"
            params={{ id: p.id }}
            className="font-bold text-white hover:text-[#ff6b2b] transition-colors"
          >
            {p.name?.trim() || projectClientLabel(p)}
          </Link>
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
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider border border-white/10 backdrop-blur-md ${projectStatusBadgeClass(status)}`}
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
  };

  const items: { label: string; count: number; className: string; status: Project["status"] }[] = [
    { label: "Done", count: counts.completed, className: "text-emerald-400", status: "completed" },
    { label: "Ongoing", count: counts.active, className: "text-[#ff6b2b]", status: "active" },
    {
      label: "In discussions",
      count: counts.planning,
      className: "text-sky-400",
      status: "planning",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((item) => {
        const isActive = selected === item.status;
        const baseClass = "rounded-2xl border px-4 py-3.5 text-center transition-all duration-200";
        const toneClass = isActive
          ? "border-orange-500/60 bg-gradient-to-b from-[#ff6b2b]/20 to-[#f04400]/10 shadow-lg shadow-orange-500/20 ring-1 ring-orange-500/40"
          : "glass-card border-white/10 hover:border-white/20";
        if (!onSelect) {
          return (
            <div key={item.label} className={`${baseClass} ${toneClass}`}>
              <p className={`text-2xl font-black tabular-nums tracking-tight ${item.className}`}>
                {item.count}
              </p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-white/50">{item.label}</p>
            </div>
          );
        }
        return (
          <button
            key={item.label}
            type="button"
            onClick={() => onSelect(item.status)}
            aria-pressed={isActive}
            className={`${baseClass} ${toneClass} cursor-pointer hover:translate-y-[-2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50`}
          >
            <p className={`text-2xl font-black tabular-nums tracking-tight ${item.className}`}>{item.count}</p>
            <p
              className={`mt-1 text-xs font-semibold uppercase tracking-wider ${isActive ? "text-white" : "text-white/50"}`}
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
    <section className="glass-panel space-y-6 rounded-3xl border border-white/10 p-6 shadow-2xl">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-white">Projects pipeline</h2>
          <p className="mt-1 text-xs text-white/50">
            {projects.length} clients tracked across all stages.
          </p>
        </div>
        <Link
          to="/projects"
          className="text-xs font-semibold uppercase tracking-wider text-[#ff6b2b] hover:text-[#ff8a50] transition-colors"
        >
          View all →
        </Link>
      </div>
      <ProjectsPipelineSummary projects={projects} />
      {ongoing.length > 0 && (
        <div className="pt-2">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-white/60">Ongoing ({ongoing.length})</h3>
          <ProjectsTable projects={ongoing} showActions={false} />
        </div>
      )}
    </section>
  );
}
