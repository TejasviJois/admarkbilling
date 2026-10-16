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
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-white/60 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Team
        </Link>
        <OperationsPageHeader
          title="Project Assignments"
          description="See who is working on each project and toggle team members on or off. A project can have several people on it."
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search projects…"
            className="pl-9 rounded-xl border-white/10 bg-white/5 text-xs text-white placeholder:text-white/40 focus:border-[#ff6b2b]/50"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/10 glass-panel p-1">
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
      </div>

      <section className="rounded-2xl border border-white/10 glass-panel overflow-hidden shadow-xl">
        <div className="divide-y divide-white/5">
          {projects.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-white/40">
              No projects match this filter.
            </p>
          ) : (
            projects.map((project) => {
              const assigned = projectAssignedMemberIds(project);
              return (
                <div
                  key={project.id}
                  className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-white/[0.02]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <Link
                        to="/projects/$id"
                        params={{ id: project.id }}
                        className="font-bold text-white hover:text-[#ff6b2b] transition-colors"
                      >
                        {project.name?.trim() || project.client}
                      </Link>
                      <ProjectStatusBadge status={project.status} />
                    </div>
                    <p className="mt-1 text-xs text-white/50">
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
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
                            isOn
                              ? "border-[#ff6b2b]/40 bg-[#ff6b2b]/15 text-[#ff6b2b] shadow-[0_0_10px_rgba(255,107,43,0.2)]"
                              : "border-white/10 bg-white/[0.02] text-white/60 hover:border-white/20 hover:text-white"
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
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
        active
          ? "bg-gradient-to-r from-[#ff6b2b] to-[#f04400] text-white shadow-md shadow-[#ff6b2b]/20"
          : "text-white/60 hover:text-white hover:bg-white/5"
      }`}
    >
      {label}
    </button>
  );
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "?";
}
