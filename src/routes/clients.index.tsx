import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Eye, EyeOff, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClientFormDialog } from "@/components/operations/ClientFormDialog";
import { ClientsTable } from "@/components/operations/ClientsTable";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";
import { relinkProjectsAfterClientRename } from "@/lib/client-links";
import {
  countClientProjects,
  projectsForClientRelationship,
  type ClientProjectCounts,
} from "@/lib/client-projects";
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
  const [showDetails, setShowDetails] = useState(false);

  const clients = ops.clients ?? [];

  // "Active" wins over "Completed"; clients with no revenue projects show "No Projects".
  const projectStatsById = useMemo(() => {
    const badge = new Map<string, ProjectBadge>();
    const counts = new Map<string, ClientProjectCounts>();
    const roots = clients.filter((client) => !client.parentClientId);
    for (const client of roots) {
      const related = projectsForClientRelationship(ops.projects, client, clients);
      const projectCounts = countClientProjects(related);
      counts.set(client.id, projectCounts);
      badge.set(
        client.id,
        projectCounts.active > 0 ? "active" : projectCounts.completed > 0 ? "completed" : "none",
      );
    }
    return { badge, counts };
  }, [clients, ops.projects]);

  const projectBadgeById = projectStatsById.badge;
  const projectCountsById = projectStatsById.counts;

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
        const byClientStatus = Number(a.status !== "active") - Number(b.status !== "active");
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
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={() => setShowDetails((open) => !open)}
              aria-label={showDetails ? "Hide client details" : "Show client details"}
              aria-pressed={showDetails}
              title={showDetails ? "Hide details" : "Show details"}
            >
              {showDetails ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </Button>
            <Button type="button" size="icon" onClick={openAdd} aria-label="Add client">
              <Plus className="h-5 w-5" />
            </Button>
          </div>
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
        projectBadgeById={projectBadgeById}
        projectCountsById={projectCountsById}
        onEdit={openEdit}
        onRemove={handleRemove}
        showDetails={showDetails}
        emptyMessage={
          search.trim()
            ? "No clients match your search."
            : "No clients configured. Add your first client profile to get started."
        }
      />
    </div>
  );
}
