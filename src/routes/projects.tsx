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

export const Route = createFileRoute("/projects")({ component: ProjectsPage });

function ProjectsPage() {
  const { ops, persist, loading } = useOperations();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("all");

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
          <Button type="button" size="icon" onClick={openAdd} aria-label="Add project">
            <Plus className="h-5 w-5" />
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
