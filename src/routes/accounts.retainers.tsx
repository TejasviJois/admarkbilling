import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, PauseCircle, Trash2, XCircle } from "lucide-react";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useOperations } from "@/hooks/use-operations";
import { formatINRWhole } from "@/lib/invoice-calc";
import {
  buildRevenueValueFromBilling,
  formatBillingLabel,
  recurringStatus,
  resolveProjectBilling,
  sumActiveMrr,
  sumFutureMonthlyPipeline,
} from "@/lib/project-billing";
import { isRevenueProject, projectClientLabel } from "@/lib/project-status";
import type { Project, ProjectBilling } from "@/lib/types";

export const Route = createFileRoute("/accounts/retainers")({ component: RetainersPage });

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

type RetainerRow = {
  project: Project;
  client: string;
  billing: ProjectBilling;
  scheduleLabel: string;
  perMonth: number;
};

function RetainersPage() {
  const { ops, persist, loading } = useOperations();
  const [turningOff, setTurningOff] = useState<RetainerRow | null>(null);

  const asOf = today();

  const rows = useMemo(() => {
    return ops.projects
      .filter((p) => isRevenueProject(p.status))
      .map((project) => {
        const billing = resolveProjectBilling(project);
        if (!billing.monthlyAmount) return null;
        return {
          project,
          client: projectClientLabel(project),
          billing,
          scheduleLabel: formatBillingLabel(billing),
          perMonth: billing.monthlyAmount,
          status: recurringStatus(billing, asOf),
        };
      })
      .filter((r): r is RetainerRow & { status: ReturnType<typeof recurringStatus> } => r != null);
  }, [ops.projects, asOf]);

  const active = rows.filter((r) => r.status === "active");
  const future = rows.filter((r) => r.status === "not_started");
  const closed = rows.filter((r) => r.status === "ended" && r.billing.monthlyEndDate != null);

  const activeMrrTotal = sumActiveMrr(ops.projects, asOf);
  const futureTotal = sumFutureMonthlyPipeline(ops.projects, asOf);

  const updateBilling = (project: Project, patch: Partial<ProjectBilling>) => {
    const billing: ProjectBilling = { ...resolveProjectBilling(project), ...patch };
    // Never fall back to the old label — stale "/month" text would be re-parsed
    // into billing on the next load and resurrect a deleted retainer.
    const updated: Project = {
      ...project,
      billing,
      revenueValue: buildRevenueValueFromBilling(billing),
    };
    persist({
      ...ops,
      projects: ops.projects.map((p) => (p.id === project.id ? updated : p)),
    });
  };

  const startRetainer = (row: RetainerRow) => {
    updateBilling(row.project, { monthlyStartDate: today(), monthlyEndDate: undefined });
  };

  const moveToFuture = (row: RetainerRow) => {
    updateBilling(row.project, { monthlyStartDate: undefined, monthlyEndDate: undefined });
    setTurningOff(null);
  };

  const closePermanently = (row: RetainerRow) => {
    updateBilling(row.project, { monthlyEndDate: today() });
    setTurningOff(null);
  };

  // Strips the monthly schedule from the project's billing — the project itself
  // and any one-time/upfront billing stay untouched.
  const deleteRetainer = (row: RetainerRow) => {
    if (
      !confirm(
        `Delete the ${formatINRWhole(row.perMonth)}/month retainer for ${row.client}? ` +
          "The project stays — only the monthly billing is removed.",
      )
    ) {
      return;
    }
    updateBilling(row.project, {
      monthlyAmount: undefined,
      monthlyMonths: undefined,
      monthlyStartDate: undefined,
      monthlyEndDate: undefined,
    });
  };

  if (loading) return <OperationsLoading />;

  return (
    <div className="space-y-6">
      <Link
        to="/analytics"
        className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white/50 hover:text-white transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Insights
      </Link>
      <OperationsPageHeader
        title="Monthly Retainers"
        description="Turn retainers on when billing starts, or turn them off — back to future monthly or closed for good."
      />

      <RetainerSection
        title="Active MRR"
        subtitle={`${formatINRWhole(activeMrrTotal)}/month from started retainers`}
        emptyMessage="No retainers are running right now."
        rows={active}
        onDelete={deleteRetainer}
        renderToggle={(row) => (
          <Switch
            checked
            onCheckedChange={() => setTurningOff(row)}
            aria-label={`Turn off retainer for ${row.client}`}
          />
        )}
      />

      <RetainerSection
        title="Future Monthly"
        subtitle={`${formatINRWhole(futureTotal)}/month waiting to start`}
        emptyMessage="No unstarted retainers — everything is either running or closed."
        rows={future}
        onDelete={deleteRetainer}
        renderToggle={(row) => (
          <Switch
            checked={false}
            onCheckedChange={() => startRetainer(row)}
            aria-label={`Start retainer for ${row.client}`}
          />
        )}
      />

      {closed.length > 0 && (
        <RetainerSection
          title="Closed Permanently"
          subtitle="These retainers no longer count anywhere."
          emptyMessage=""
          rows={closed}
          onDelete={deleteRetainer}
          muted
        />
      )}

      <Dialog open={turningOff != null} onOpenChange={(open) => !open && setTurningOff(null)}>
        <DialogContent className="sm:max-w-md glass-panel border border-white/10 rounded-3xl shadow-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-white text-lg font-bold">Turn off retainer — {turningOff?.client}</DialogTitle>
            <DialogDescription className="text-white/60 text-xs">
              {turningOff ? `${formatINRWhole(turningOff.perMonth)}/month. ` : ""}
              Choose what happens to this retainer.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 pt-2">
            <button
              type="button"
              onClick={() => turningOff && moveToFuture(turningOff)}
              className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition-all hover:border-[#ff6b2b]/50 hover:bg-white/10 cursor-pointer"
            >
              <PauseCircle className="mt-0.5 h-5 w-5 shrink-0 text-sky-400" />
              <span>
                <span className="block font-bold text-white text-sm">Move to Future monthly</span>
                <span className="mt-0.5 block text-xs text-white/50">
                  Pauses billing — the retainer waits in the pipeline and can be started again
                  anytime.
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => turningOff && closePermanently(turningOff)}
              className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition-all hover:border-rose-500/50 hover:bg-rose-500/10 cursor-pointer"
            >
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
              <span>
                <span className="block font-bold text-white text-sm">Close permanently</span>
                <span className="mt-0.5 block text-xs text-white/50">
                  Ends this retainer for good — it stops counting in MRR and future monthly.
                </span>
              </span>
            </button>
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setTurningOff(null)} className="rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10">
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RetainerSection({
  title,
  subtitle,
  emptyMessage,
  rows,
  renderToggle,
  onDelete,
  muted = false,
}: {
  title: string;
  subtitle: string;
  emptyMessage: string;
  rows: RetainerRow[];
  renderToggle?: (row: RetainerRow) => React.ReactNode;
  onDelete?: (row: RetainerRow) => void;
  muted?: boolean;
}) {
  return (
    <section
      className={`glass-panel rounded-3xl border border-white/10 p-6 shadow-2xl space-y-4 ${muted ? "opacity-60" : ""}`}
    >
      <div className="border-b border-white/10 pb-4">
        <h2 className="text-lg font-bold tracking-tight text-white">{title}</h2>
        <p className="mt-1 text-xs text-white/50">{subtitle}</p>
      </div>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-xs text-white/40">{emptyMessage}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li
              key={row.project.id}
              className="glass-card flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 p-4 transition-all hover:border-white/20"
            >
              <div className="min-w-0">
                <Link
                  to="/projects/$id"
                  params={{ id: row.project.id }}
                  className="font-bold text-[#ff6b2b] hover:text-[#ff8a50] transition-colors"
                >
                  {row.project.name?.trim() || row.client}
                </Link>
                {row.project.name?.trim() &&
                  row.client.trim() &&
                  row.project.name.trim() !== row.client.trim() && (
                    <span className="ml-2 text-xs text-white/50">({row.client})</span>
                  )}
                {row.project.projectType && (
                  <span className="ml-2 text-[11px] font-semibold text-white/40 uppercase tracking-wider">
                    · {row.project.projectType}
                  </span>
                )}
                <p className="mt-1 text-xs text-white/45">{row.scheduleLabel}</p>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-black tabular-nums text-emerald-400 text-base">
                  {formatINRWhole(row.perMonth)}
                  <span className="text-xs font-normal text-white/50">/mo</span>
                </span>
                {renderToggle?.(row)}
                {onDelete && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => onDelete(row)}
                    className="h-8 w-8 text-white/40 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                    aria-label={`Delete retainer for ${row.client}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
