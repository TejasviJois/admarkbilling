import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectFormDialog } from "@/components/operations/ProjectFormDialog";
import { ProjectsSection } from "@/components/operations/ProjectsSection";
import { ProjectsPipelineSummary } from "@/components/operations/ProjectsTable";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";
import type { Project, ProjectStatus } from "@/lib/types";

export const Route = createFileRoute("/projects/")({ component: ProjectsPage });

function ProjectsPage() {
  const { ops, persist, loading } = useOperations();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  // Land on Ongoing by default — click the card again to see all statuses.
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("active");

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (project: Project) => {
    setEditing(project);
    setFormOpen(true);
  };

  const handleSave = (saved: Project) => {
    const prior = editing ? ops.projects.find((p) => p.id === saved.id) : null;
    const project: Project = {
      ...saved,
      payments: prior?.payments ?? saved.payments,
      paymentProofs: prior?.paymentProofs ?? saved.paymentProofs,
      paymentStatus: prior?.paymentStatus ?? saved.paymentStatus,
    };

    const nextProjects = editing
      ? ops.projects.map((p) => (p.id === project.id ? project : p))
      : [project, ...ops.projects];

    persist({ ...ops, projects: nextProjects });
  };

  if (loading) return <OperationsLoading />;

  return (
    <div>
      <OperationsPageHeader
        title="Projects"
        description="Manage client work, timelines, and project status across Admark Digitals."
        action={
          <Button
            type="button"
            onClick={openAdd}
            aria-label="Add project"
            className="rounded-xl bg-gradient-to-r from-[#ff6b2b] to-[#f04400] text-white shadow-lg shadow-orange-500/25 hover:brightness-110 active:scale-95 font-bold transition-all px-4"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add Project
          </Button>
        }
      />
      <div className="mb-8">
        <ProjectsPipelineSummary
          projects={ops.projects}
          selected={statusFilter === "all" ? undefined : statusFilter}
          onSelect={(status) => setStatusFilter((current) => (current === status ? "all" : status))}
        />
      </div>
      <ProjectFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        project={editing}
        onSave={handleSave}
      />
      <ProjectsSection
        ops={ops}
        persist={persist}
        onEdit={openEdit}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
      />
    </div>
  );
}
