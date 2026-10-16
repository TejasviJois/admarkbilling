import { useEffect, useMemo, useRef, useState } from "react";
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
  const { ops, persist, loading, ready } = useOperations();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [search, setSearch] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const purgedOrphans = useRef(false);

  const clients = ops.clients ?? [];

  // "Active" wins over "Completed"; clients with no revenue projects are not rostered.
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

  // Drop empty "No Projects" shells from storage once (Blue Blocks, Go Holiday, etc.).
  useEffect(() => {
    if (!ready || purgedOrphans.current) return;
    const orphanIds = clients
      .filter((client) => !client.parentClientId)
      .filter((client) => {
        const counts = projectCountsById.get(client.id);
        return (counts?.active ?? 0) + (counts?.completed ?? 0) === 0;
      })
      .map((client) => client.id);
    if (orphanIds.length === 0) {
      purgedOrphans.current = true;
      return;
    }
    purgedOrphans.current = true;
    const remove = new Set(orphanIds);
    for (const client of clients) {
      if (client.parentClientId && remove.has(client.parentClientId)) remove.add(client.id);
    }
    persist(
      {
        ...ops,
        clients: clients.filter((client) => !remove.has(client.id)),
        projects: ops.projects.map((project) =>
          project.clientId && remove.has(project.clientId)
            ? { ...project, clientId: undefined }
            : project,
        ),
      },
      { deleteIds: { clients: [...remove] } },
    );
  }, [ready, clients, projectCountsById, ops, persist]);

  const visibleClients = useMemo(() => {
    const query = search.trim().toLowerCase();
    return clients
      .filter((client) => !client.parentClientId)
      .filter((client) => {
        const revenueCount =
          (projectCountsById.get(client.id)?.active ?? 0) +
          (projectCountsById.get(client.id)?.completed ?? 0);
        return revenueCount > 0;
      })
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
  }, [clients, search, projectBadgeById, projectCountsById]);

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
    <div className="space-y-6">
      <OperationsPageHeader
        title="Clients & Accounts"
        description="Companies with ongoing or completed work. Empty prospect shells are removed automatically."
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
              className="rounded-xl border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
            >
              {showDetails ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button
              type="button"
              onClick={openAdd}
              aria-label="Add client"
              className="rounded-xl bg-gradient-to-r from-[#ff6b2b] to-[#f04400] text-white shadow-lg shadow-orange-500/25 hover:brightness-110 active:scale-95 font-bold transition-all px-4"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add Client
            </Button>
          </div>
        }
      />

      <div className="relative max-w-md">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"
          aria-hidden
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients by name, contact, email…"
          className="rounded-xl border border-white/10 bg-white/5 pl-10 text-white placeholder-white/30 focus:border-orange-500/50 focus:bg-white/[0.08] transition-all"
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
            : "No clients with projects yet. Profiles appear here when a deal is Won and work is ongoing or completed."
        }
      />
    </div>
  );
}
