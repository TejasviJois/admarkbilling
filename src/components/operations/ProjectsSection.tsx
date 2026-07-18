import { useMemo, useState } from "react";
import { Briefcase } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchWithPeriodFilter } from "@/components/operations/SearchWithPeriodFilter";
import type { OperationsData, Project, ProjectStatus } from "@/lib/types";
import {
  matchesAnyDateInPeriod,
  DEFAULT_PERIOD,
  type PeriodKey,
  projectRelevantDates,
} from "@/lib/date-range-filter";
import { projectClientLabel, projectStatusLabel } from "@/lib/project-status";
import { DataSection, EmptyRow, Field } from "./operations-ui";
import { ProjectsTable } from "./ProjectsTable";

const PROJECT_STATUSES: ProjectStatus[] = [
  "completed",
  "active",
  "planning",
  "on_hold",
  "cancelled",
];

export function ProjectsSection({
  ops,
  persist,
  onEdit,
  statusFilter: controlledStatus,
  onStatusFilterChange,
}: {
  ops: OperationsData;
  persist: (next: OperationsData) => void;
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

  const removeProject = (id: string) => {
    persist({ ...ops, projects: ops.projects.filter((p) => p.id !== id) });
  };

  const sectionTitle =
    statusFilter === "all" ? "All projects" : `${projectStatusLabel(statusFilter)} projects`;

  return (
    <DataSection
      title={sectionTitle}
      description="Operational view of project status, progress, contacts, and contract revenue."
      icon={<Briefcase className="h-5 w-5 text-primary" strokeWidth={2} />}
    >
      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <SearchWithPeriodFilter
          id="proj-search"
          search={search}
          onSearchChange={setSearch}
          period={period}
          onPeriodChange={setPeriod}
          placeholder="Client or project type…"
        />
        <Field label="Status" id="proj-filter-status">
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as ProjectStatus | "all")}
          >
            <SelectTrigger id="proj-filter-status">
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
        </Field>
      </div>

      {ops.projects.length === 0 ? (
        <EmptyRow message="No projects logged yet." />
      ) : filtered.length === 0 ? (
        <EmptyRow
          message={
            statusFilter === "all"
              ? "No projects match your search."
              : `No ${projectStatusLabel(statusFilter).toLowerCase()} projects${search.trim() ? " match your search" : ""}.`
          }
        />
      ) : (
        <ProjectsTable
          projects={filtered}
          onEdit={onEdit}
          onRemove={removeProject}
          showOutstanding={
            statusFilter === "all" || statusFilter === "completed" || statusFilter === "active"
          }
        />
      )}
    </DataSection>
  );
}
