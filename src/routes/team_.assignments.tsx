import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { ProjectStatusBadge } from "@/components/operations/ProjectsTable";
import { useCompany } from "@/hooks/use-company";
import { useOperations } from "@/hooks/use-operations";
import { projectAssignedMemberIds } from "@/lib/project-status";
import type { Project } from "@/lib/types";

export const Route = createFileRoute("/team_/assignments")({
  component: TeamAssignmentsPage,
});

const statusOrder: Record<Project["status"], number> = {
  active: 0,
  planning: 1,
  on_hold: 2,
  completed: 3,
  cancelled: 4,
};

function TeamAssignmentsPage() {
  const { company, loading: companyLoading } = useCompany();
  const { ops, persist, loading: operationsLoading } = useOperations();
  const [search, setSearch] = useState("");
  const [memberFilter, setMemberFilter] = useState<string>("all");

  const members = useMemo(
    () => (company.companyMembers ?? []).filter((member) => member.status !== "inactive"),
    [company.companyMembers],
  );

  const projects = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...ops.projects]
      .filter((project) => {
        if (memberFilter === "unassigned" && projectAssignedMemberIds(project).length > 0) {
          return false;
        }
        if (
          memberFilter !== "all" &&
          memberFilter !== "unassigned" &&
          !projectAssignedMemberIds(project).includes(memberFilter)
        ) {
          return false;
        }
        if (!query) return true;
        return `${project.name ?? ""} ${project.client}`.toLowerCase().includes(query);
      })
      .sort(
        (a, b) =>
          statusOrder[a.status] - statusOrder[b.status] ||
          (a.name || a.client).localeCompare(b.name || b.client),
      );
  }, [ops.projects, search, memberFilter]);

  const toggleAssignment = (project: Project, memberId: string) => {
    const current = new Set(projectAssignedMemberIds(project));
    if (current.has(memberId)) current.delete(memberId);
    else current.add(memberId);
    const assignedMembers = [...current];
    persist({
      ...ops,
      projects: ops.projects.map((candidate) =>
        candidate.id === project.id
          ? {
              ...candidate,
              assignedMembers,
              // Legacy single-owner field stays in sync for older views.
              assignedPartner: assignedMembers[0],
            }
          : candidate,
      ),
    });
  };

  if (companyLoading || operationsLoading) return <OperationsLoading />;

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/team"
          className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Team
        </Link>
        <OperationsPageHeader
          title="Project Assignments"
          description="See who is working on each project and toggle team members on or off. A project can have several people on it."
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search projects…"
            className="pl-8"
          />
        </div>
        <FilterChip
          label="All"
          active={memberFilter === "all"}
          onClick={() => setMemberFilter("all")}
        />
        <FilterChip
          label="Unassigned"
          active={memberFilter === "unassigned"}
          onClick={() => setMemberFilter("unassigned")}
        />
        {members.map((member) => (
          <FilterChip
            key={member.id}
            label={firstName(member.name)}
            active={memberFilter === member.id}
            onClick={() => setMemberFilter(member.id)}
          />
        ))}
      </div>

      <section className="rounded-xl border border-border bg-card shadow-sm">
        <div className="divide-y divide-border">
          {projects.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              No projects match this filter.
            </p>
          ) : (
            projects.map((project) => {
              const assigned = projectAssignedMemberIds(project);
              return (
                <div
                  key={project.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to="/projects/$id"
                        params={{ id: project.id }}
                        className="font-semibold text-primary hover:underline"
                      >
                        {project.name?.trim() || project.client}
                      </Link>
                      <ProjectStatusBadge status={project.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {project.client}
                      {assigned.length === 0 ? " · Unassigned" : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {members.map((member) => {
                      const isOn = assigned.includes(member.id);
                      return (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() => toggleAssignment(project, member.id)}
                          aria-pressed={isOn}
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                            isOn
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                          }`}
                        >
                          {isOn && <Check className="h-3 w-3" />}
                          {firstName(member.name)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "?";
}
