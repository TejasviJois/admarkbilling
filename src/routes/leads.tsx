import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LeadFormDialog } from "@/components/operations/LeadFormDialog";
import { CRMKanbanBoard } from "@/components/crm/CRMKanbanBoard";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";
import { formatINRWhole } from "@/lib/invoice-calc";
import { syncLeadLifecycle } from "@/lib/lead-conversion";
import { toLocalISODate } from "@/lib/date-range-filter";
import {
  archiveLead,
  computeLeadCrmStats,
  isLeadArchived,
  visibleLeadsForBoard,
} from "@/lib/lead-stats";
import type { Lead, LeadStatus } from "@/lib/types";

export const Route = createFileRoute("/leads")({ component: LeadsPage });

function LeadsPage() {
  const { ops, persist, loading } = useOperations();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);

  const leads = ops.leads ?? [];
  const boardLeads = useMemo(() => visibleLeadsForBoard(leads), [leads]);
  const stats = useMemo(() => computeLeadCrmStats(leads), [leads]);

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
      ? leads.map((l) =>
          l.id === saved.id ? { ...saved, archivedAt: l.archivedAt ?? saved.archivedAt } : l,
        )
      : [saved, ...leads];
    const forLifecycle = nextLeads.find((l) => l.id === saved.id) ?? saved;
    persist(syncLeadLifecycle({ ...ops, leads: nextLeads }, forLifecycle));
  };

  const handleRemove = (id: string) => {
    const lead = leads.find((l) => l.id === id);
    if (!lead || isLeadArchived(lead)) return;
    if (
      !confirm(
        "Remove from pipeline? This hides the deal here but keeps win/lost history. Projects are not changed.",
      )
    ) {
      return;
    }
    const archived = archiveLead(lead, toLocalISODate());
    persist({
      ...ops,
      leads: leads.map((l) => (l.id === id ? archived : l)),
    });
  };

  const handleMoveStatus = (id: string, nextStatus: LeadStatus) => {
    const moved = leads.find((l) => l.id === id);
    if (!moved || isLeadArchived(moved)) return;
    const nextLead = { ...moved, status: nextStatus };
    const nextLeads = leads.map((l) => (l.id === id ? nextLead : l));
    persist(syncLeadLifecycle({ ...ops, leads: nextLeads }, nextLead));
  };

  if (loading) return <OperationsLoading />;

  return (
    <div className="space-y-6">
      <OperationsPageHeader
        title="Sales CRM Pipeline"
        description="Kanban pipeline board tracking prospects, deal probabilities, and sales closing forecasts."
        action={
          <Button type="button" onClick={openAdd} className="inline-flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add Deal
          </Button>
        }
      />

      {/* CRM Stats Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Pipeline Value
          </p>
          <p className="mt-2 text-2xl font-bold text-foreground tabular-nums">
            {formatINRWhole(stats.pipelineValue)}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {stats.activeCount} active deals in funnel
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Expected Value
          </p>
          <p className="mt-2 text-2xl font-bold text-primary tabular-nums">
            {formatINRWhole(stats.expectedRevenue)}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">Weighted by deal probability</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Win Rate
          </p>
          <p className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {stats.conversionRate.toFixed(1)}%
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {stats.wonCount} won &middot; {stats.lostDeals} lost
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Lost Deals
          </p>
          <p className="mt-2 text-2xl font-bold text-rose-600 dark:text-rose-400 tabular-nums">
            {stats.lostDeals}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">Inactive / closed lost</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Avg Deal Size
          </p>
          <p className="mt-2 text-2xl font-bold text-blue-600 dark:text-blue-400 tabular-nums">
            {formatINRWhole(stats.averageDealSize)}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">Average forecast budget</p>
        </div>
      </div>

      {/* Visual Kanban Board */}
      <div className="rounded-xl border border-border bg-card/40 p-4 shadow-sm">
        <CRMKanbanBoard
          leads={boardLeads}
          onEdit={openEdit}
          onRemove={handleRemove}
          onMoveStatus={handleMoveStatus}
        />
      </div>

      <LeadFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        lead={editing}
        clients={ops.clients ?? []}
        onSave={handleSave}
      />
    </div>
  );
}
