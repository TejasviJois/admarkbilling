import { useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PartnershipFormDialog } from "@/components/operations/PartnershipFormDialog";
import {
  PartnershipsPipelineSummary,
  PartnershipsSection,
} from "@/components/operations/PartnershipsSection";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";
import { loadCompany } from "@/lib/storage";
import type { Partnership } from "@/lib/types";

export const Route = createFileRoute("/partnerships")({
  beforeLoad: async () => {
    const company = await loadCompany();
    if (company.partnershipsEnabled !== true) {
      throw redirect({ to: "/projects" });
    }
  },
  component: PartnershipsPage,
});

function PartnershipsPage() {
  const { ops, persist, loading } = useOperations();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Partnership | null>(null);

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (partnership: Partnership) => {
    setEditing(partnership);
    setFormOpen(true);
  };

  const handleSave = (saved: Partnership) => {
    const nextPartnerships = editing
      ? ops.partnerships.map((p) => (p.id === saved.id ? saved : p))
      : [saved, ...ops.partnerships];
    persist({ ...ops, partnerships: nextPartnerships });
  };

  if (loading) return <OperationsLoading />;

  return (
    <div>
      <OperationsPageHeader
        title="Partnerships"
        description="Track vendors, affiliates, and strategic partners in one place."
        action={
          <Button type="button" size="icon" onClick={openAdd} aria-label="Add partnership">
            <Plus className="h-5 w-5" />
          </Button>
        }
      />
      <div className="mb-8">
        <PartnershipsPipelineSummary partnerships={ops.partnerships} />
      </div>
      <PartnershipFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        partnership={editing}
        onSave={handleSave}
      />
      <PartnershipsSection ops={ops} persist={persist} onEdit={openEdit} />
    </div>
  );
}
