import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClientFormDialog } from "@/components/operations/ClientFormDialog";
import { ClientsTable } from "@/components/operations/ClientsTable";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";
import type { Client } from "@/lib/types";

export const Route = createFileRoute("/clients/")({ component: ClientsPage });

function ClientsPage() {
  const { ops, persist, loading } = useOperations();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);

  const clients = ops.clients ?? [];

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
    persist({ ...ops, clients: nextClients });
  };

  const handleRemove = (id: string) => {
    if (!confirm("Remove this client profile? All linked projects and invoices will remain but lose their client profile reference.")) return;
    persist({ ...ops, clients: clients.filter((c) => c.id !== id) });
  };

  if (loading) return <OperationsLoading />;

  return (
    <div>
      <OperationsPageHeader
        title="Clients"
        description="Centralized directory of companies, contacts, billing profiles, and client relationship logs."
        action={
          <Button type="button" size="icon" onClick={openAdd} aria-label="Add client">
            <Plus className="h-5 w-5" />
          </Button>
        }
      />
      <ClientFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        client={editing}
        onSave={handleSave}
      />
      <ClientsTable clients={clients} onEdit={openEdit} onRemove={handleRemove} />
    </div>
  );
}
