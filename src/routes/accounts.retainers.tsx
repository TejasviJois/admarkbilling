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
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Insights
      </Link>
      <OperationsPageHeader
        title="Monthly retainers"
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
        title="Future monthly"
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
          title="Closed permanently"
          subtitle="These retainers no longer count anywhere."
          emptyMessage=""
          rows={closed}
          onDelete={deleteRetainer}
          muted
        />
      )}

      <Dialog open={turningOff != null} onOpenChange={(open) => !open && setTurningOff(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Turn off retainer — {turningOff?.client}</DialogTitle>
            <DialogDescription>
              {turningOff ? `${formatINRWhole(turningOff.perMonth)}/month. ` : ""}
              Choose what happens to this retainer.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <button
              type="button"
              onClick={() => turningOff && moveToFuture(turningOff)}
              className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-muted/20"
            >
              <PauseCircle className="mt-0.5 h-5 w-5 shrink-0 text-sky-400" />
              <span>
                <span className="block font-semibold text-foreground">Move to Future monthly</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  Pauses billing — the retainer waits in the pipeline and can be started again
                  anytime.
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => turningOff && closePermanently(turningOff)}
              className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-rose-500/50 hover:bg-rose-500/5"
            >
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
              <span>
                <span className="block font-semibold text-foreground">Close permanently</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  Ends this retainer for good — it stops counting in MRR and future monthly.
                </span>
              </span>
            </button>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTurningOff(null)}>
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
      className={`rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6 ${muted ? "opacity-70" : ""}`}
    >
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
          {rows.map((row) => (
            <li
              key={row.project.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <Link
                  to="/projects/$id"
                  params={{ id: row.project.id }}
                  className="font-semibold text-primary hover:underline"
                >
                  {row.project.name?.trim() || row.client}
                </Link>
                {row.project.name?.trim() &&
                  row.client.trim() &&
                  row.project.name.trim() !== row.client.trim() && (
                    <span className="ml-2 text-xs text-muted-foreground">{row.client}</span>
                  )}
                {row.project.projectType && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {row.project.projectType}
                  </span>
                )}
                <p className="mt-0.5 text-xs text-muted-foreground">{row.scheduleLabel}</p>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-bold tabular-nums text-foreground">
                  {formatINRWhole(row.perMonth)}
                  <span className="text-xs font-normal text-muted-foreground">/month</span>
                </span>
                {renderToggle?.(row)}
                {onDelete && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => onDelete(row)}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
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
