import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClientFormDialog } from "@/components/operations/ClientFormDialog";
import { ClientsTable } from "@/components/operations/ClientsTable";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";
import { relinkProjectsAfterClientRename } from "@/lib/client-links";
import { isRevenueProject } from "@/lib/project-status";
import type { Client } from "@/lib/types";

export const Route = createFileRoute("/clients/")({ component: ClientsPage });

type ProjectBadge = "active" | "completed" | "none";

const BADGE_ORDER: Record<ProjectBadge, number> = {
  active: 0,
  completed: 1,
  none: 2,
};

function ClientsPage() {
  const { ops, persist, loading } = useOperations();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [search, setSearch] = useState("");

  const clients = ops.clients ?? [];

  // "Active" wins over "Completed"; clients with no revenue projects show "No Projects".
  const projectBadgeById = useMemo(() => {
    const normalized = (value: string) => value.trim().toLowerCase();
    const map = new Map<string, ProjectBadge>();
    const roots = clients.filter((client) => !client.parentClientId);
    for (const client of roots) {
      const companyIds = new Set([
        client.id,
        ...clients.filter((child) => child.parentClientId === client.id).map((child) => child.id),
      ]);
      const companyNames = new Set(
        clients
          .filter((candidate) => companyIds.has(candidate.id))
          .map((candidate) => normalized(candidate.companyName)),
      );
      const related = ops.projects.filter(
        (project) =>
          isRevenueProject(project.status) &&
          ((project.clientId != null && companyIds.has(project.clientId)) ||
            companyNames.has(normalized(project.client))),
      );
      map.set(
        client.id,
        related.some((project) => project.status === "active")
          ? "active"
          : related.some((project) => project.status === "completed")
            ? "completed"
            : "none",
      );
    }
    return map;
  }, [clients, ops.projects]);

  const visibleClients = useMemo(() => {
    const query = search.trim().toLowerCase();
    return clients
      .filter((client) => !client.parentClientId)
      .filter((client) => {
        if (!query) return true;
        return [client.companyName, client.contactPerson, client.email, client.phone, client.status]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => {
        const badgeA = projectBadgeById.get(a.id) ?? "none";
        const badgeB = projectBadgeById.get(b.id) ?? "none";
        const byBadge = BADGE_ORDER[badgeA] - BADGE_ORDER[badgeB];
        if (byBadge !== 0) return byBadge;
        const byClientStatus =
          Number(a.status !== "active") - Number(b.status !== "active");
        if (byClientStatus !== 0) return byClientStatus;
        return a.companyName.localeCompare(b.companyName);
      });
  }, [clients, search, projectBadgeById]);

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (client: Client) => {
    setEditing(client);
    setFormOpen(true);
  };

  const handleSave = (saved: Client) => {
    const nextClients = editing
      ? clients.map((c) => (c.id === saved.id ? saved : c))
      : [saved, ...clients];
    const nextProjects = editing
      ? relinkProjectsAfterClientRename(ops.projects, editing, saved)
      : ops.projects;
    persist({ ...ops, clients: nextClients, projects: nextProjects });
  };

  const handleRemove = (id: string) => {
    if (clients.some((client) => client.parentClientId === id)) {
      alert(
        "This relationship has company clients under it. Move or remove those companies first.",
      );
      return;
    }
    if (
      !confirm(
        "Remove this client profile? All linked projects and invoices will remain but lose their client profile reference.",
      )
    )
      return;
    persist(
      {
        ...ops,
        clients: clients.filter((c) => c.id !== id),
        // Drop the dangling reference so the auto-repair doesn't restore the client.
        projects: ops.projects.map((p) => (p.clientId === id ? { ...p, clientId: undefined } : p)),
      },
      { deleteIds: { clients: [id] } },
    );
  };

  if (loading) return <OperationsLoading />;

  return (
    <div className="space-y-4">
      <OperationsPageHeader
        title="Clients"
        description="Centralized directory of companies, contacts, billing profiles, and client relationship logs."
        action={
          <Button type="button" size="icon" onClick={openAdd} aria-label="Add client">
            <Plus className="h-5 w-5" />
          </Button>
        }
      />

      <div className="relative max-w-md">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients…"
          className="pl-9"
          aria-label="Search clients"
        />
      </div>

      <ClientFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        client={editing}
        clients={clients}
        onSave={handleSave}
      />
      <ClientsTable
        clients={visibleClients}
        allClients={clients}
        projectBadgeById={projectBadgeById}
        onEdit={openEdit}
        onRemove={handleRemove}
        emptyMessage={
          search.trim()
            ? "No clients match your search."
            : "No clients configured. Add your first client profile to get started."
        }
      />
    </div>
  );
}
