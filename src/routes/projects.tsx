import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectFormDialog } from "@/components/operations/ProjectFormDialog";
import { ProjectsSection } from "@/components/operations/ProjectsSection";
import { ProjectsPipelineSummary } from "@/components/operations/ProjectsTable";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";
import { resolveProjectClient } from "@/lib/project-clients";
import type { Project, ProjectStatus } from "@/lib/types";

export const Route = createFileRoute("/projects")({ component: ProjectsPage });

/** Default pipeline view — "In discussions" is the working base list. */
const BASE_STATUS: ProjectStatus = "planning";

function ProjectsPage() {
  const { ops, persist, loading } = useOperations();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">(BASE_STATUS);

  const handleSummarySelect = (status: ProjectStatus) => {
    // Clicking the already-active card returns to the base (In discussions) view.
    setStatusFilter((current) => (current === status ? BASE_STATUS : status));
  };

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
    const merged: Project = {
      ...saved,
      payments: prior?.payments ?? saved.payments,
      paymentProofs: prior?.paymentProofs ?? saved.paymentProofs,
      paymentStatus: prior?.paymentStatus ?? saved.paymentStatus,
      historicalReceived: prior?.historicalReceived ?? saved.historicalReceived,
    };

    // New client names typed in the dialog become real client records here.
    const { project, clients } = resolveProjectClient(ops, merged);

    const nextProjects = editing
      ? ops.projects.map((p) => (p.id === project.id ? project : p))
      : [project, ...ops.projects];

    persist({ ...ops, projects: nextProjects, clients });
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
          onSelect={handleSummarySelect}
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
