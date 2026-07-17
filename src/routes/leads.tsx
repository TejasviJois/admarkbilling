import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, DollarSign, Percent, BarChart3, TrendingUp, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LeadFormDialog } from "@/components/operations/LeadFormDialog";
import { CRMKanbanBoard } from "@/components/crm/CRMKanbanBoard";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";
import { formatINRWhole } from "@/lib/invoice-calc";
import { ensureClientForWonLead } from "@/lib/lead-conversion";
import type { Lead, LeadStatus } from "@/lib/types";

export const Route = createFileRoute("/leads")({ component: LeadsPage });

function LeadsPage() {
  const { ops, persist, loading } = useOperations();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);

  const leads = ops.leads ?? [];

  // CRM Calculations
  const stats = useMemo(() => {
    // 1. Pipeline Value: Sum of expected revenue of active deals (exclude won, lost)
    const activeDeals = leads.filter((l) => l.status !== "won" && l.status !== "lost");
    const pipelineValue = activeDeals.reduce((sum, l) => sum + (l.expectedRevenue || 0), 0);

    // 2. Expected Revenue: Weighted sum of expected revenue * (probability / 100) for active deals
    const expectedRevenue = activeDeals.reduce((sum, l) => {
      const prob = l.probability != null ? l.probability : 50; // default to 50%
      return sum + (l.expectedRevenue || 0) * (prob / 100);
    }, 0);

    // 3. Conversion Rate / Win Rate: Won / (Won + Lost) * 100
    const wonCount = leads.filter((l) => l.status === "won").length;
    const lostCount = leads.filter((l) => l.status === "lost").length;
    const closedCount = wonCount + lostCount;
    const conversionRate = closedCount > 0 ? (wonCount / closedCount) * 100 : 0;

    // 4. Lost Deals
    const lostDeals = lostCount;

    // 5. Average Deal Size: across all deals with an expected revenue
    const revenueDeals = leads.filter((l) => l.expectedRevenue != null && l.expectedRevenue > 0);
    const averageDealSize =
      revenueDeals.length > 0
        ? revenueDeals.reduce((sum, l) => sum + (l.expectedRevenue || 0), 0) / revenueDeals.length
        : 0;

    return {
      pipelineValue,
      expectedRevenue,
      conversionRate,
      lostDeals,
      averageDealSize,
      activeCount: activeDeals.length,
      wonCount,
    };
  }, [leads]);

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
    let next = { ...ops, leads: nextLeads };
    if (saved.status === "won") next = ensureClientForWonLead(next, saved);
    persist(next);
  };

  const handleRemove = (id: string) => {
    if (!confirm("Are you sure you want to delete this CRM deal record?")) return;
    persist({ ...ops, leads: leads.filter((l) => l.id !== id) });
  };

  const handleMoveStatus = (id: string, nextStatus: LeadStatus) => {
    const nextLeads = leads.map((l) => (l.id === id ? { ...l, status: nextStatus } : l));
    let next = { ...ops, leads: nextLeads };
    if (nextStatus === "won") {
      const wonLead = nextLeads.find((l) => l.id === id);
      if (wonLead) next = ensureClientForWonLead(next, wonLead);
    }
    persist(next);
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
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pipeline Value</p>
          <p className="mt-2 text-2xl font-bold text-foreground tabular-nums">
            {formatINRWhole(stats.pipelineValue)}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">{stats.activeCount} active deals in funnel</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Expected Value</p>
          <p className="mt-2 text-2xl font-bold text-primary tabular-nums">
            {formatINRWhole(stats.expectedRevenue)}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">Weighted by deal probability</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Win Rate</p>
          <p className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {stats.conversionRate.toFixed(1)}%
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">{stats.wonCount} won &middot; {stats.lostDeals} lost</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Lost Deals</p>
          <p className="mt-2 text-2xl font-bold text-rose-600 dark:text-rose-400 tabular-nums">
            {stats.lostDeals}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">Inactive / closed lost</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Avg Deal Size</p>
          <p className="mt-2 text-2xl font-bold text-blue-600 dark:text-blue-400 tabular-nums">
            {formatINRWhole(stats.averageDealSize)}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">Average forecast budget</p>
        </div>
      </div>

      {/* Visual Kanban Board */}
      <div className="rounded-xl border border-border bg-card/40 p-4 shadow-sm">
        <CRMKanbanBoard
          leads={leads}
          onEdit={openEdit}
          onRemove={handleRemove}
          onMoveStatus={handleMoveStatus}
        />
      </div>

      <LeadFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        lead={editing}
        onSave={handleSave}
      />
    </div>
  );
}
