import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Edit2, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClientFormDialog } from "@/components/operations/ClientFormDialog";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";
import { relinkProjectsAfterClientRename } from "@/lib/client-links";
import { findLeadForClient, leadFromClient } from "@/lib/lead-conversion";
import { isRevenueProject } from "@/lib/project-status";
import type { Client, Lead } from "@/lib/types";

export const Route = createFileRoute("/directory")({ component: DirectoryPage });

type Stage = "client" | "lead" | "contact";

const STAGE_BADGE: Record<Stage, { label: string; className: string }> = {
  client: { label: "Client", className: "bg-green-500/10 text-green-500" },
  lead: { label: "In leads", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  contact: { label: "Contact", className: "bg-muted-foreground/10 text-muted-foreground" },
};

type DirectoryRow = {
  key: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  stage: Stage;
  client?: Client;
  lead?: Lead;
};

function DirectoryPage() {
  const { ops, persist, loading } = useOperations();
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);

  const clients = ops.clients ?? [];
  const leads = ops.leads ?? [];

  const rows = useMemo<DirectoryRow[]>(() => {
    const normalized = (value: string) => value.trim().toLowerCase();

    const activeLeads = leads.filter((lead) => lead.status !== "won" && lead.status !== "lost");

    const isOngoingClient = (client: Client) => {
      const companyIds = new Set([
        client.id,
        ...clients.filter((child) => child.parentClientId === client.id).map((child) => child.id),
      ]);
      const companyNames = new Set(
        clients
          .filter((candidate) => companyIds.has(candidate.id))
          .map((candidate) => normalized(candidate.companyName)),
      );
      return ops.projects.some(
        (project) =>
          isRevenueProject(project.status) &&
          ((project.clientId != null && companyIds.has(project.clientId)) ||
            companyNames.has(normalized(project.client))),
      );
    };

    const clientRows: DirectoryRow[] = clients.map((client) => {
      const pipelineLead = findLeadForClient(activeLeads, client);
      const stage: Stage = isOngoingClient(client)
        ? "client"
        : pipelineLead
          ? "lead"
          : "contact";
      return {
        key: client.id,
        name: client.companyName,
        contactPerson: client.contactPerson,
        phone: client.phone,
        email: client.email,
        stage,
        client,
        lead: pipelineLead,
      };
    });

    const knownNames = new Set(clients.map((client) => normalized(client.companyName)));
    const leadRows: DirectoryRow[] = activeLeads
      .filter(
        (lead) =>
          ![lead.company, lead.name, lead.contactPerson].some(
            (value) => value && knownNames.has(normalized(value)),
          ),
      )
      .map((lead) => ({
        key: lead.id,
        name: lead.company || lead.name || "Unnamed lead",
        contactPerson: lead.contactPerson || lead.name || "",
        phone: lead.phone ?? "",
        email: lead.email ?? "",
        stage: "lead" as const,
        lead,
      }));

    return [...clientRows, ...leadRows].sort((a, b) => a.name.localeCompare(b.name));
  }, [clients, leads, ops.projects]);

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.name, row.contactPerson, row.phone, row.email].some((value) =>
        value.toLowerCase().includes(q),
      ),
    );
  }, [rows, query]);

  const moveToLeads = (client: Client) => {
    persist({ ...ops, leads: [leadFromClient(client), ...leads] });
  };

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

  const handleRemove = (client: Client) => {
    if (clients.some((candidate) => candidate.parentClientId === client.id)) {
      alert("This relationship has company clients under it. Move or remove those companies first.");
      return;
    }
    if (!confirm(`Remove ${client.companyName} from the directory?`)) return;
    persist({
      ...ops,
      clients: clients.filter((c) => c.id !== client.id),
      // Drop the dangling reference so the auto-repair doesn't restore the client.
      projects: ops.projects.map((p) =>
        p.clientId === client.id ? { ...p, clientId: undefined } : p,
      ),
    });
  };

  if (loading) return <OperationsLoading />;

  return (
    <div className="space-y-6">
      <OperationsPageHeader
        title="Directory"
        description="Everyone you know — move a contact to Leads when talks start; won leads graduate to Clients."
        action={
          <Button type="button" size="icon" onClick={openAdd} aria-label="Add contact">
            <Plus className="h-5 w-5" />
          </Button>
        }
      />

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, contact, phone, email…"
          className="pl-9"
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full table-auto border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Contact Person</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    {query ? "No matches in the directory." : "Directory is empty. Add your first contact."}
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => (
                  <tr key={row.key} className="hover:bg-muted/30">
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-foreground">
                      {row.stage === "client" && row.client ? (
                        <Link
                          to="/clients/$id"
                          params={{ id: row.client.id }}
                          className="text-primary hover:underline"
                        >
                          {row.name}
                        </Link>
                      ) : (
                        row.name
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {row.contactPerson || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {row.phone || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {row.email || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${STAGE_BADGE[row.stage].className}`}
                      >
                        {STAGE_BADGE[row.stage].label}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {row.stage === "contact" && row.client && (
                          <button
                            type="button"
                            onClick={() => moveToLeads(row.client!)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-card px-2.5 text-xs font-medium text-foreground hover:bg-secondary"
                            title="Move to Leads"
                          >
                            Move to leads
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {row.stage === "lead" && (
                          <Link
                            to="/leads"
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-card px-2.5 text-xs font-medium text-foreground hover:bg-secondary"
                            title="Open the Leads pipeline"
                          >
                            Open in Leads
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        )}
                        {row.client && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEdit(row.client!)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-card text-muted-foreground hover:bg-secondary"
                              title="Edit contact"
                              aria-label="Edit contact"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemove(row.client!)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-card text-destructive hover:bg-destructive/10"
                              title="Remove from directory"
                              aria-label="Remove from directory"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ClientFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        client={editing}
        clients={clients}
        onSave={handleSave}
      />
    </div>
  );
}
