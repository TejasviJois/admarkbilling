import { useMemo, useState } from "react";
import { Briefcase, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OperationsData, Project, ProjectStatus } from "@/lib/types";
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
  onManagePayments,
  onViewProof,
}: {
  ops: OperationsData;
  persist: (next: OperationsData) => void;
  onEdit: (project: Project) => void;
  onManagePayments?: (project: Project) => void;
  onViewProof?: (project: Project) => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ops.projects.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = [
        projectClientLabel(p),
        p.projectType,
        p.revenueValue,
        p.paymentStatus,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [ops.projects, search, statusFilter]);

  const removeProject = (id: string) => {
    persist({ ...ops, projects: ops.projects.filter((p) => p.id !== id) });
  };

  return (
    <DataSection
      title="All projects"
      description="Client pipeline with project type, revenue, and payment status."
      icon={<Briefcase className="h-5 w-5 text-primary" strokeWidth={2} />}
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_auto] lg:items-end">
        <Field label="Search" id="proj-search">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="proj-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Client or project type…"
              className="pl-9"
            />
          </div>
        </Field>
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
        <EmptyRow message="No projects match your search." />
      ) : (
        <ProjectsTable
          projects={filtered}
          onEdit={onEdit}
          onRemove={removeProject}
          onManagePayments={onManagePayments}
          onViewProof={onViewProof}
        />
      )}
    </DataSection>
  );
}
