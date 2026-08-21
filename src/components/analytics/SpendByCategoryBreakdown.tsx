import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { SpendByCategoryRow } from "@/lib/analytics";
import { formatINRWhole } from "@/lib/invoice-calc";
import { cn } from "@/lib/utils";

/** Readable on dark UI — distinct hues, no purple glow stack. */
const SLICE_COLORS = [
  "#38bdf8", // sky
  "#34d399", // emerald
  "#fbbf24", // amber
  "#fb7185", // rose
  "#2dd4bf", // teal
  "#fb923c", // orange
  "#a3e635", // lime
  "#67e8f9", // cyan
  "#f472b6", // pink
  "#94a3b8", // slate
];

type ChartRow = SpendByCategoryRow & { fill: string };

function SpendTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartRow }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-foreground">{row.category}</p>
      <p className="mt-1 tabular-nums text-muted-foreground">
        {formatINRWhole(row.amount)} · {row.sharePct}% · {row.count}{" "}
        {row.count === 1 ? "entry" : "entries"}
      </p>
    </div>
  );
}

export function SpendByCategoryBreakdown({
  rows,
  monthLabel,
  embedded = false,
}: {
  rows: SpendByCategoryRow[];
  monthLabel: string;
  /** When true, skip the outer title — parent chapter already labels this block. */
  embedded?: boolean;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const total = rows.reduce((sum, row) => sum + row.amount, 0);

  const chartData = useMemo<ChartRow[]>(
    () =>
      rows.map((row, index) => ({
        ...row,
        fill: SLICE_COLORS[index % SLICE_COLORS.length],
      })),
    [rows],
  );

  const body =
    rows.length === 0 ? (
      <p className="border-y border-dashed border-border/80 py-10 text-center text-sm text-muted-foreground">
        No money-out transactions in this range.
      </p>
    ) : (
      <div className="grid gap-0 border-y border-border/80 lg:grid-cols-[minmax(0,1.1fr)_minmax(16rem,0.9fr)]">
        <div className="relative flex min-h-[260px] items-center justify-center px-2 py-4 sm:min-h-[300px]">
          <ResponsiveContainer width="100%" height="100%" minHeight={260}>
            <PieChart>
              <Pie
                data={chartData}
                dataKey="amount"
                nameKey="category"
                cx="50%"
                cy="50%"
                innerRadius="52%"
                outerRadius="78%"
                paddingAngle={chartData.length > 1 ? 2 : 0}
                stroke="hsl(var(--background))"
                strokeWidth={2}
                onMouseEnter={(_, index) => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(null)}
              >
                {chartData.map((row, index) => (
                  <Cell
                    key={row.category}
                    fill={row.fill}
                    opacity={activeIndex === null || activeIndex === index ? 1 : 0.35}
                    style={{ outline: "none", cursor: "pointer" }}
                  />
                ))}
              </Pie>
              <Tooltip content={<SpendTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Total out
            </p>
            <p className="text-base font-semibold tabular-nums text-foreground sm:text-lg">
              {formatINRWhole(total)}
            </p>
          </div>
        </div>

        <ul className="max-h-[320px] space-y-0.5 overflow-y-auto border-t border-border/80 p-2 lg:border-l lg:border-t-0 lg:p-3">
          {chartData.map((row, index) => (
            <li key={row.category}>
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
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {row.category}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {row.sharePct}%
                </span>
                <span className="w-[5.5rem] shrink-0 text-right text-sm tabular-nums text-foreground">
                  {formatINRWhole(row.amount)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );

  if (embedded) return body;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-foreground">Spend by category</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Where money went in {monthLabel}. Hover a slice for details.
        </p>
      </div>
      {body}
    </section>
  );
}
