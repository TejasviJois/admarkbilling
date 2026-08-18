import { useMemo, useState } from "react";
import { ChevronDown, Users } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { buildClientRevenueBreakdown, type ClientRevenueRow } from "@/lib/client-revenue-analytics";
import { formatINRWhole } from "@/lib/invoice-calc";
import type { Client, Project } from "@/lib/types";
import { cn } from "@/lib/utils";

const ROW_GRID =
  "grid grid-cols-1 gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1.5fr)_7rem_8rem_7rem] sm:items-center sm:gap-4 sm:px-4";

function AmountCells({
  booked,
  fyRemaining,
  total,
  emphasize,
}: {
  booked: number;
  fyRemaining: number;
  total: number;
  emphasize?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 text-right text-sm tabular-nums sm:contents">
      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground sm:hidden">Booked</p>
        <p>{formatINRWhole(booked)}</p>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground sm:hidden">
          FY retainer
        </p>
        <p className={fyRemaining > 0 ? "text-sky-300" : "text-muted-foreground"}>
          {fyRemaining > 0 ? formatINRWhole(fyRemaining) : "—"}
        </p>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground sm:hidden">Total</p>
        <p className={emphasize ? "font-semibold text-foreground" : "font-medium text-foreground"}>
          {formatINRWhole(total)}
        </p>
      </div>
    </div>
  );
}

function ClientRevenueRowItem({ row }: { row: ClientRevenueRow }) {
  const [open, setOpen] = useState(false);
  const hasMultiple = row.projects.length > 1;

  const nameCell = (
    <div className="flex min-w-0 items-center gap-2">
      {hasMultiple ? (
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      ) : null}
      <div className="min-w-0">
        <p className="truncate font-medium text-foreground">{row.client}</p>
        <p className="text-xs text-muted-foreground">
          {row.projectCount} project{row.projectCount === 1 ? "" : "s"}
        </p>
      </div>
    </div>
  );

  if (!hasMultiple) {
    return (
      <div className={cn(ROW_GRID, "border-b border-border last:border-b-0")}>
        {nameCell}
        <AmountCells
          booked={row.booked}
          fyRemaining={row.fyRemaining}
          total={row.total}
          emphasize
        />
      </div>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b border-border last:border-b-0">
      <CollapsibleTrigger className={cn(ROW_GRID, "w-full text-left hover:bg-muted/30")}>
        {nameCell}
        <AmountCells
          booked={row.booked}
          fyRemaining={row.fyRemaining}
          total={row.total}
          emphasize
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="bg-muted/20">
          {row.projects.map((project) => (
            <div key={project.id} className={ROW_GRID}>
              <div className="min-w-0 sm:pl-6">
                <p className="truncate text-sm font-medium text-foreground">{project.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {[project.company, project.projectType].filter(Boolean).join(" · ")}
                </p>
              </div>
              <AmountCells
                booked={project.booked}
                fyRemaining={project.fyRemaining}
                total={project.total}
              />
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ClientRevenueBreakdown({
  projects,
  clients,
}: {
  projects: Project[];
  clients?: Client[];
}) {
  const summary = useMemo(
    () => buildClientRevenueBreakdown(projects, undefined, clients),
    [projects, clients],
  );

  if (summary.clients.length === 0) {
    return (
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/40">
            <Users className="h-4 w-4 text-primary" aria-hidden />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Revenue by client</h2>
            <p className="mt-1 text-sm text-muted-foreground">No booked revenue yet.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/40">
          <Users className="h-4 w-4 text-primary" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">Revenue by client</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            FY {summary.financialYear} · booked plus retainer outlook through 31 Mar
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <div
          className={cn(
            ROW_GRID,
            "hidden border-b border-border bg-muted/30 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid",
          )}
        >
          <span>Client</span>
          <span className="text-right">Booked</span>
          <span className="text-right">FY retainer</span>
          <span className="text-right">Total</span>
        </div>
        {summary.clients.map((row) => (
          <ClientRevenueRowItem key={row.id} row={row} />
        ))}
      </div>
    </section>
  );
}
