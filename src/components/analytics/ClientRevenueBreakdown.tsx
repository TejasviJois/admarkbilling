import { useMemo, useState } from "react";
import { ChevronDown, List, PieChart as PieChartIcon, Users } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { buildClientRevenueBreakdown, type ClientRevenueRow } from "@/lib/client-revenue-analytics";
import { formatINRWhole } from "@/lib/invoice-calc";
import type { Client, Project } from "@/lib/types";
import { cn } from "@/lib/utils";

const ROW_GRID =
  "grid grid-cols-1 gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1.5fr)_7rem_8rem_7rem] sm:items-center sm:gap-4 sm:px-4";

const SLICE_COLORS = [
  "#38bdf8",
  "#34d399",
  "#fbbf24",
  "#fb7185",
  "#2dd4bf",
  "#fb923c",
  "#a3e635",
  "#67e8f9",
  "#f472b6",
  "#94a3b8",
];

type ViewMode = "list" | "chart";

type ChartRow = {
  id: string;
  client: string;
  total: number;
  booked: number;
  fyRemaining: number;
  sharePct: number;
  fill: string;
};

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
      <div className={cn(ROW_GRID, "border-b border-border/80 last:border-b-0")}>
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
    <Collapsible open={open} onOpenChange={setOpen} className="border-b border-border/80 last:border-b-0">
      <CollapsibleTrigger className={cn(ROW_GRID, "w-full text-left hover:bg-muted/20")}>
        {nameCell}
        <AmountCells
          booked={row.booked}
          fyRemaining={row.fyRemaining}
          total={row.total}
          emphasize
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="bg-muted/10">
          {row.projects.map((project) => (
            <div key={project.id} className={ROW_GRID}>
              <div className="min-w-0 sm:pl-6">
                <p className="truncate text-sm text-foreground">{project.name}</p>
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

function ClientTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartRow }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="max-w-xs rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-foreground">{row.client}</p>
      <p className="mt-1 tabular-nums text-muted-foreground">
        Total {formatINRWhole(row.total)} · {row.sharePct}%
      </p>
      <p className="mt-0.5 tabular-nums text-muted-foreground">
        Booked {formatINRWhole(row.booked)}
        {row.fyRemaining > 0 ? ` · FY ${formatINRWhole(row.fyRemaining)}` : ""}
      </p>
    </div>
  );
}

function ClientRevenueChart({ rows, grandTotal }: { rows: ChartRow[]; grandTotal: number }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  return (
    <div className="grid gap-0 border-y border-border/80 lg:grid-cols-[minmax(0,1.1fr)_minmax(16rem,0.9fr)]">
      <div className="relative flex min-h-[260px] items-center justify-center px-2 py-4 sm:min-h-[300px]">
        <ResponsiveContainer width="100%" height="100%" minHeight={260}>
          <PieChart>
            <Pie
              data={rows}
              dataKey="total"
              nameKey="client"
              cx="50%"
              cy="50%"
              innerRadius="52%"
              outerRadius="78%"
              paddingAngle={rows.length > 1 ? 2 : 0}
              stroke="hsl(var(--background))"
              strokeWidth={2}
              onMouseEnter={(_, index) => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              {rows.map((row, index) => (
                <Cell
                  key={row.id}
                  fill={row.fill}
                  opacity={activeIndex === null || activeIndex === index ? 1 : 0.35}
                  style={{ outline: "none", cursor: "pointer" }}
                />
              ))}
            </Pie>
            <Tooltip content={<ClientTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Total
          </p>
          <p className="text-base font-semibold tabular-nums text-foreground sm:text-lg">
            {formatINRWhole(grandTotal)}
          </p>
        </div>
      </div>

      <ul className="max-h-[320px] space-y-0.5 overflow-y-auto border-t border-border/80 p-2 lg:border-l lg:border-t-0 lg:p-3">
        {rows.map((row, index) => (
          <li key={row.id}>
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors",
                activeIndex === index ? "bg-muted/50" : "hover:bg-muted/30",
              )}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
              onFocus={() => setActiveIndex(index)}
              onBlur={() => setActiveIndex(null)}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: row.fill }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{row.client}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {row.sharePct}%
              </span>
              <span className="w-[5.5rem] shrink-0 text-right text-sm tabular-nums text-foreground">
                {formatINRWhole(row.total)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ClientRevenueList({ clients }: { clients: ClientRevenueRow[] }) {
  return (
    <div className="border-y border-border/80">
      <div
        className={cn(
          ROW_GRID,
          "hidden border-b border-border/80 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid",
        )}
      >
        <span>Client</span>
        <span className="text-right">Booked</span>
        <span className="text-right">FY retainer</span>
        <span className="text-right">Total</span>
      </div>
      {clients.map((row) => (
        <ClientRevenueRowItem key={row.id} row={row} />
      ))}
    </div>
  );
}

export function ClientRevenueBreakdown({
  projects,
  clients,
  embedded = false,
}: {
  projects: Project[];
  clients?: Client[];
  /** When true, skip the outer card chrome — parent chapter already frames this block. */
  embedded?: boolean;
}) {
  const [view, setView] = useState<ViewMode>("list");
  const summary = useMemo(
    () => buildClientRevenueBreakdown(projects, undefined, clients),
    [projects, clients],
  );

  const chartRows = useMemo<ChartRow[]>(() => {
    const grand = summary.totalRevenue || 1;
    return summary.clients.map((row, index) => ({
      id: row.id,
      client: row.client,
      total: row.total,
      booked: row.booked,
      fyRemaining: row.fyRemaining,
      sharePct: Math.round((row.total / grand) * 1000) / 10,
      fill: SLICE_COLORS[index % SLICE_COLORS.length],
    }));
  }, [summary.clients, summary.totalRevenue]);

  const viewToggle = (
    <div className="inline-flex gap-0.5" role="group" aria-label="Revenue view">
      <button
        type="button"
        onClick={() => setView("list")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
          view === "list"
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
        )}
        aria-pressed={view === "list"}
      >
        <List className="h-3.5 w-3.5" />
        List
      </button>
      <button
        type="button"
        onClick={() => setView("chart")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
          view === "chart"
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
        )}
        aria-pressed={view === "chart"}
      >
        <PieChartIcon className="h-3.5 w-3.5" />
        Chart
      </button>
    </div>
  );

  if (summary.clients.length === 0) {
    if (embedded) {
      return (
        <p className="border-y border-dashed border-border/80 py-10 text-center text-sm text-muted-foreground">
          No booked revenue yet.
        </p>
      );
    }
    return (
      <section className="space-y-3">
        <div className="flex items-start gap-3">
          <Users className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <div>
            <h2 className="text-base font-semibold tracking-tight">Revenue by client</h2>
            <p className="mt-1 text-sm text-muted-foreground">No booked revenue yet.</p>
          </div>
        </div>
      </section>
    );
  }

  const content =
    view === "list" ? (
      <ClientRevenueList clients={summary.clients} />
    ) : (
      <ClientRevenueChart rows={chartRows} grandTotal={summary.totalRevenue} />
    );

  if (embedded) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">{viewToggle}</div>
        {content}
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">Revenue by client</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            FY {summary.financialYear} · booked plus retainer outlook through 31 Mar
          </p>
        </div>
        {viewToggle}
      </div>
      {content}
    </section>
  );
}
