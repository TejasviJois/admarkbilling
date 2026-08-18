import { useMemo, useState } from "react";
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
  reopenLostLead,
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
    if (moved.status === "lost" && nextStatus === "won") return;
    const nextLead = { ...moved, status: nextStatus };
    const nextLeads = leads.map((l) => (l.id === id ? nextLead : l));
    persist(syncLeadLifecycle({ ...ops, leads: nextLeads }, nextLead));
  };

  const handleReopen = (id: string) => {
    const lead = leads.find((l) => l.id === id);
    if (!lead || lead.status !== "lost") return;
    const nextLead = reopenLostLead(lead, toLocalISODate());
    persist(
      syncLeadLifecycle(
        { ...ops, leads: leads.map((item) => (item.id === id ? nextLead : item)) },
        nextLead,
      ),
    );
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
      <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-5">
        <LeadStat
          label="Pipeline Value"
          value={formatINRWhole(stats.pipelineValue)}
          caption={`${stats.activeCount} active deals in funnel`}
        />
        <LeadStat
          label="Expected Value"
          value={formatINRWhole(stats.expectedRevenue)}
          valueClassName="text-primary"
          caption="Weighted by deal probability"
        />
        <LeadStat
          label="Win Rate"
          value={`${stats.conversionRate.toFixed(1)}%`}
          valueClassName="text-emerald-600 dark:text-emerald-400"
          caption={`${stats.wonCount} won · ${stats.lostDeals} lost`}
        />
        <LeadStat
          label="Lost Deals"
          value={String(stats.lostDeals)}
          valueClassName="text-rose-600 dark:text-rose-400"
          caption="Inactive / closed lost"
        />
        <LeadStat
          label="Avg Deal Size"
          value={formatINRWhole(stats.averageDealSize)}
          valueClassName="text-blue-600 dark:text-blue-400"
          caption="Average forecast budget"
          className="col-span-2 lg:col-span-1"
        />
      </div>

      {/* Visual Kanban Board */}
      <div className="rounded-xl border border-border bg-card/40 p-4 shadow-sm">
        <CRMKanbanBoard
          leads={boardLeads}
          onEdit={openEdit}
          onRemove={handleRemove}
          onMoveStatus={handleMoveStatus}
          onReopen={handleReopen}
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

function LeadStat({
  label,
  value,
  caption,
  valueClassName,
  className,
}: {
  label: string;
  value: string;
  caption: string;
  valueClassName?: string;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-border bg-card p-3 shadow-sm sm:p-4 ${className ?? ""}`}
    >
      <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-xs">
        {label}
      </p>
      <p
        className={`mt-1.5 text-lg font-bold tabular-nums sm:mt-2 sm:text-2xl ${valueClassName ?? "text-foreground"}`}
      >
        {value}
      </p>
      <p className="mt-1 truncate text-[10px] text-muted-foreground">{caption}</p>
    </div>
  );
}
