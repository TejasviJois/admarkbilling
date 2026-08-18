import { useMemo, useState, type ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchWithPeriodFilter } from "@/components/operations/SearchWithPeriodFilter";
import type { OperationsData, Project, ProjectStatus } from "@/lib/types";
import type { PersistOperations } from "@/lib/operations-mutations";
import {
  matchesAnyDateInPeriod,
  DEFAULT_PERIOD,
  type PeriodKey,
  projectRelevantDates,
} from "@/lib/date-range-filter";
import { projectHasOpenRetainer } from "@/lib/project-billing";
import { projectClientLabel, projectStatusLabel } from "@/lib/project-status";
import { EmptyRow } from "./operations-ui";
import { ProjectsTable } from "./ProjectsTable";

const PROJECT_STATUSES: ProjectStatus[] = [
  "completed",
  "active",
  "planning",
  "on_hold",
  "cancelled",
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ProjectsSection({
  ops,
  persist,
  onEdit,
  statusFilter: controlledStatus,
  onStatusFilterChange,
}: {
  ops: OperationsData;
  persist: PersistOperations;
  onEdit: (project: Project) => void;
  /** Controlled status filter (e.g. driven by the pipeline summary cards). */
  statusFilter?: ProjectStatus | "all";
  onStatusFilterChange?: (status: ProjectStatus | "all") => void;
}) {
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<PeriodKey>(DEFAULT_PERIOD);
  const [internalStatus, setInternalStatus] = useState<ProjectStatus | "all">("all");
  const statusFilter = controlledStatus ?? internalStatus;
  const setStatusFilter = onStatusFilterChange ?? setInternalStatus;
  const asOf = today();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ops.projects.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (!matchesAnyDateInPeriod(projectRelevantDates(p), period)) return false;
      if (!q) return true;
      const haystack = [
        projectClientLabel(p),
        p.name,
        p.projectType,
        p.revenueValue,
        p.paymentStatus,
        p.phone,
        p.email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [ops.projects, search, period, statusFilter]);

  const segmented = useMemo(() => {
    if (statusFilter !== "active" && statusFilter !== "completed") return null;
    const withRetainer = filtered.filter((p) => projectHasOpenRetainer(p, asOf));
    const withoutRetainer = filtered.filter((p) => !projectHasOpenRetainer(p, asOf));
    return { withRetainer, withoutRetainer };
  }, [filtered, statusFilter, asOf]);

  const removeProject = (id: string) => {
    persist(
      { ...ops, projects: ops.projects.filter((p) => p.id !== id) },
      { deleteIds: { projects: [id] } },
    );
  };

  const showOutstanding =
    statusFilter === "all" || statusFilter === "completed" || statusFilter === "active";

  const showSegments = Boolean(segmented) && filtered.length > 0 && ops.projects.length > 0;

  const emptyMessage =
    statusFilter === "all"
      ? "No projects match your search."
      : `No ${projectStatusLabel(statusFilter).toLowerCase()} projects${search.trim() ? " match your search" : ""}.`;

  const filters = (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
      <SearchWithPeriodFilter
        id="proj-search"
        search={search}
        onSearchChange={setSearch}
        period={period}
        onPeriodChange={setPeriod}
        placeholder="Search projects…"
        className="w-full sm:w-auto"
        inputClassName="h-8 text-sm sm:w-56"
      />
      <Select
        value={statusFilter}
        onValueChange={(v) => setStatusFilter(v as ProjectStatus | "all")}
      >
        <SelectTrigger
          id="proj-filter-status"
          className="h-8 w-full text-sm sm:w-[10rem]"
          aria-label="Status filter"
        >
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {PROJECT_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {projectStatusLabel(s)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <section className="scroll-mt-24 rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6">
      {!showSegments && <div className="mb-5">{filters}</div>}

      {ops.projects.length === 0 ? (
        <EmptyRow message="No projects logged yet." />
      ) : filtered.length === 0 ? (
        <EmptyRow message={emptyMessage} />
      ) : showSegments && segmented ? (
        <div className="space-y-8">
          <ProjectSegment
            title={
              statusFilter === "active" ? "Without monthly retainers" : "Done — no active retainer"
            }
            description={
              statusFilter === "active"
                ? "One-time / contract work only — no monthly billing on these."
                : "Project work is finished and monthly billing is not running."
            }
            projects={segmented.withoutRetainer}
            emptyMessage={
              statusFilter === "active"
                ? "Every ongoing project currently has a monthly retainer."
                : "Every done project still has an ongoing retainer."
            }
            onEdit={onEdit}
            onRemove={removeProject}
            showOutstanding={showOutstanding}
            actions={filters}
          />
          <ProjectSegment
            title={statusFilter === "active" ? "With monthly retainers" : "Ongoing retainers"}
            description={
              statusFilter === "active"
                ? "These projects include (or will include) a monthly retainer."
                : "Project marked Done, but the monthly retainer is still active — manage billing here."
            }
            projects={segmented.withRetainer}
            emptyMessage={
              statusFilter === "active"
                ? "No ongoing projects have a monthly retainer yet."
                : "No done projects with an active monthly retainer."
            }
            onEdit={onEdit}
            onRemove={removeProject}
            showOutstanding={showOutstanding}
            emphasizeRetainer
          />
        </div>
      ) : (
        <ProjectsTable
          projects={filtered}
          onEdit={onEdit}
          onRemove={removeProject}
          showOutstanding={showOutstanding}
        />
      )}
    </section>
  );
}

function ProjectSegment({
  title,
  description,
  projects,
  emptyMessage,
  onEdit,
  onRemove,
  showOutstanding,
  emphasizeRetainer = false,
  actions,
}: {
  title: string;
  description: string;
  projects: Project[];
  emptyMessage: string;
  onEdit: (project: Project) => void;
  onRemove: (id: string) => void;
  showOutstanding: boolean;
  emphasizeRetainer?: boolean;
  actions?: ReactNode;
}) {
  return (
    <div>
      <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0 xl:flex-1">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            {title}
            <span className="ml-2 tabular-nums text-muted-foreground">({projects.length})</span>
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        {actions ? <div className="w-full min-w-0 xl:w-auto xl:shrink-0">{actions}</div> : null}
      </div>
      {projects.length === 0 ? (
        <EmptyRow message={emptyMessage} />
      ) : (
        <ProjectsTable
          projects={projects}
          onEdit={onEdit}
          onRemove={onRemove}
          showOutstanding={showOutstanding}
          emphasizeRetainer={emphasizeRetainer}
        />
      )}
    </div>
  );
}
