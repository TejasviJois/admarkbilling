import { Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import type { Project } from "@/lib/types";
import { formatINRWhole } from "@/lib/invoice-calc";
import {
  projectClientLabel,
  projectStatusBadgeClass,
  projectStatusLabel,
} from "@/lib/project-status";
import { paymentSummary } from "@/lib/project-payments";
import { DataTable, RowDelete, RowEdit, ContactLinks } from "./operations-ui";

function PaymentCell({ project }: { project: Project }) {
  const { received, target, pending, count } = paymentSummary(project);

  if (count === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const settled = target != null && pending === 0 && received > 0;

  return (
    <div className="min-w-[8rem]">
      <div
        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 ring-1 ${
          settled
            ? "bg-emerald-500/15 ring-emerald-500/30"
            : "bg-emerald-500/10 ring-emerald-500/20"
        }`}
      >
        <CheckCircle2
          className={`h-3.5 w-3.5 shrink-0 ${settled ? "text-emerald-300" : "text-emerald-400"}`}
          aria-hidden
        />
        <div className="leading-tight">
          <p className="text-sm font-semibold tabular-nums text-emerald-300">
            {formatINRWhole(received)}
          </p>
          <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-400/90">
            Received
          </p>
        </div>
      </div>
      {target != null && pending != null && pending > 0 && (
        <p className="mt-1 text-[11px] tabular-nums text-amber-400/90">
          {formatINRWhole(pending)} pending
        </p>
      )}
    </div>
  );
}

function PaymentManageButton({
  project,
  onManagePayments,
}: {
  project: Project;
  onManagePayments?: (project: Project) => void;
}) {
  if (!onManagePayments) return null;
  const { count } = paymentSummary(project);
  return (
    <button
      type="button"
      onClick={() => onManagePayments(project)}
      className="text-xs font-medium text-primary hover:underline"
    >
      {count === 0 ? "Record payment" : `${count} payment${count === 1 ? "" : "s"} · Manage`}
    </button>
  );
}

export function ProjectsTable({
  projects,
  onEdit,
  onRemove,
  onManagePayments,
  showActions = true,
}: {
  projects: Project[];
  onEdit?: (project: Project) => void;
  onRemove?: (id: string) => void;
  onManagePayments?: (project: Project) => void;
  showActions?: boolean;
}) {
  const showPaymentManage = Boolean(onManagePayments);
  const headers = showActions
    ? [
        "Client",
        "Project type",
        "Status",
        "Revenue",
        "Contact",
        "Received",
        ...(showPaymentManage ? (["Payment"] as const) : []),
        "Actions",
      ]
    : [
        "Client",
        "Project type",
        "Status",
        "Revenue",
        "Contact",
        "Received",
        ...(showPaymentManage ? (["Payment"] as const) : []),
      ];

  return (
    <DataTable
      headers={headers}
      rows={projects.map((p) => {
        // Milestone completion calculations
        let progress = 0;
        const ms = p.milestones ?? [];
        if (ms.length > 0) {
          progress = Math.round((ms.filter((m) => m.status === "completed").length / ms.length) * 100);
        } else {
          if (p.status === "completed") progress = 100;
          else if (p.status === "active") progress = 50;
          else if (p.status === "on_hold") progress = 25;
        }

        const clientCell = (
          <div key={`client-${p.id}`} className="space-y-1">
            <Link
              to="/projects/$id"
              params={{ id: p.id }}
              className="font-bold text-primary hover:underline"
            >
              {projectClientLabel(p)}
            </Link>
            <div className="flex items-center gap-2 text-[10px]">
              {p.priority && (
                <span className={`px-1 py-0.25 rounded font-bold uppercase ${
                  p.priority === "high"
                    ? "bg-rose-500/20 text-rose-700 dark:text-rose-300"
                    : p.priority === "medium"
                    ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                    : "bg-blue-500/20 text-blue-700 dark:text-blue-300"
                }`}>
                  {p.priority}
                </span>
              )}
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <span>{progress}% done</span>
                <div className="h-1.5 w-16 bg-muted rounded overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
                </div>
              </div>
            </div>
          </div>
        );

        const cells: React.ReactNode[] = [
          clientCell,
          p.projectType || "—",
          <ProjectStatusBadge key={`st-${p.id}`} status={p.status} />,
          p.revenueValue || (p.budget != null ? formatINRWhole(p.budget) : "—"),
          <ContactLinks key={`contact-${p.id}`} phone={p.phone} email={p.email} />,
          <PaymentCell key={`pay-${p.id}`} project={p} />,
        ];
        if (showPaymentManage) {
          cells.push(
            <PaymentManageButton key={`manage-${p.id}`} project={p} onManagePayments={onManagePayments} />,
          );
        }
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
    { label: "Not interested", count: counts.cancelled, className: "text-rose-300" },
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
