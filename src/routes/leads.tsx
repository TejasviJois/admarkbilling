import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LeadFormDialog } from "@/components/operations/LeadFormDialog";
import { LeadsTable } from "@/components/operations/LeadsTable";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";
import type { Lead } from "@/lib/types";

export const Route = createFileRoute("/leads")({ component: LeadsPage });

function LeadsPage() {
  const { ops, persist, loading } = useOperations();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);

  const leads = ops.leads ?? [];

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (lead: Lead) => {
    setEditing(lead);
    setFormOpen(true);
  };

  const handleSave = (saved: Lead) => {
    const nextLeads = editing
      ? leads.map((l) => (l.id === saved.id ? saved : l))
      : [saved, ...leads];
    persist({ ...ops, leads: nextLeads });
  };

  const handleRemove = (id: string) => {
    if (!confirm("Remove this lead?")) return;
    persist({ ...ops, leads: leads.filter((l) => l.id !== id) });
  };

  if (loading) return <OperationsLoading />;

  return (
    <div>
      <OperationsPageHeader
        title="Leads"
        description="Outreach pipeline — contacts, business lines, and follow-up status."
        action={
          <Button type="button" size="icon" onClick={openAdd} aria-label="Add lead">
            <Plus className="h-5 w-5" />
          </Button>
        }
      />
      <LeadFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        lead={editing}
        onSave={handleSave}
      />
      <LeadsTable leads={leads} onEdit={openEdit} onRemove={handleRemove} />
    </div>
  );
}
