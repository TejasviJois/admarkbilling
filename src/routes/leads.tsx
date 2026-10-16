import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { History, Plus } from "lucide-react";
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
  const [optimisticStatus, setOptimisticStatus] = useState<Record<string, LeadStatus>>({});

  const leads = ops.leads ?? [];

  // Reconcile optimistic overrides once the server update lands
  useEffect(() => {
    setOptimisticStatus((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      let changed = false;
      const next = { ...prev };
      for (const [id, st] of Object.entries(prev)) {
        const serverLead = leads.find((l) => l.id === id);
        if (serverLead && serverLead.status === st) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [leads]);

  // Combined leads reflecting immediate user actions without waiting for network
  const effectiveLeads = useMemo(() => {
    if (Object.keys(optimisticStatus).length === 0) return leads;
    return leads.map((l) =>
      optimisticStatus[l.id] ? { ...l, status: optimisticStatus[l.id] } : l,
    );
  }, [leads, optimisticStatus]);

  const boardLeads = useMemo(() => visibleLeadsForBoard(effectiveLeads), [effectiveLeads]);
  const stats = useMemo(() => computeLeadCrmStats(effectiveLeads), [effectiveLeads]);

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
    const moved = effectiveLeads.find((l) => l.id === id);
    if (!moved || isLeadArchived(moved)) return;
    if (moved.status === "lost" && nextStatus === "won") return;

    // 1. Instant optimistic position update (<16ms)
    setOptimisticStatus((prev) => ({ ...prev, [id]: nextStatus }));

    // 2. Perform background persist and revert on failure
    const nextLead = { ...moved, status: nextStatus };
    const nextLeads = leads.map((l) => (l.id === id ? nextLead : l));
    persist(syncLeadLifecycle({ ...ops, leads: nextLeads }, nextLead)).catch(() => {
      setOptimisticStatus((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    });
  };

  const handleReopen = (id: string) => {
    const lead = effectiveLeads.find((l) => l.id === id);
    if (!lead || lead.status !== "lost") return;

    // 1. Instant optimistic update
    setOptimisticStatus((prev) => ({ ...prev, [id]: "new_lead" }));

    const nextLead = reopenLostLead(lead, toLocalISODate());
    persist(
      syncLeadLifecycle(
        { ...ops, leads: leads.map((item) => (item.id === id ? nextLead : item)) },
        nextLead,
      ),
    ).catch(() => {
      setOptimisticStatus((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    });
  };

  if (loading) return <OperationsLoading />;

  return (
    <div className="space-y-6">
      <OperationsPageHeader
        title="Sales CRM Pipeline"
        description="Kanban pipeline board tracking prospects, deal probabilities, and sales closing forecasts."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" asChild className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10 transition-colors">
              <Link to="/pipeline-history">
                <History className="h-4 w-4 text-[#ff6b2b]" /> History
              </Link>
            </Button>
            <Button
              type="button"
              onClick={openAdd}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#ff6b2b] to-[#f04400] text-white shadow-lg shadow-orange-500/25 hover:brightness-110 active:scale-95 font-bold transition-all"
            >
              <Plus className="h-4 w-4" /> Add Deal
            </Button>
          </div>
        }
      />

      {/* CRM Stats Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <LeadStat
          label="Pipeline Value"
          value={formatINRWhole(stats.pipelineValue)}
          caption={`${stats.activeCount} active deals in funnel`}
        />
        <LeadStat
          label="Expected Value"
          value={formatINRWhole(stats.expectedRevenue)}
          valueClassName="text-[#ff6b2b]"
          caption="Weighted by deal probability"
        />
        <LeadStat
          label="Win Rate"
          value={`${stats.conversionRate.toFixed(1)}%`}
          valueClassName="text-emerald-400"
          caption={`${stats.wonCount} won · ${stats.lostDeals} lost`}
        />
        <LeadStat
          label="Lost Deals"
          value={String(stats.lostDeals)}
          valueClassName="text-rose-400"
          caption="Inactive / closed lost"
        />
        <LeadStat
          label="Avg Deal Size"
          value={formatINRWhole(stats.averageDealSize)}
          valueClassName="text-sky-400"
          caption="Average forecast budget"
          className="col-span-2 lg:col-span-1"
        />
      </div>

      {/* Visual Kanban Board */}
      <div className="glass-panel rounded-3xl border border-white/10 p-5 shadow-2xl">
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
      className={`glass-card rounded-2xl border border-white/10 p-4 sm:p-5 transition-all duration-200 hover:border-white/20 ${className ?? ""}`}
    >
      <p className="truncate text-[10px] font-bold uppercase tracking-wider text-white/50 sm:text-xs">
        {label}
      </p>
      <p
        className={`mt-2 text-xl font-black tabular-nums tracking-tight sm:text-2xl ${valueClassName ?? "text-white"}`}
      >
        {value}
      </p>
      <p className="mt-1 truncate text-xs text-white/45">{caption}</p>
    </div>
  );
}
