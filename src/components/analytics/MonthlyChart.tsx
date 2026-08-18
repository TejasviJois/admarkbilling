import { useMemo, useState } from "react";
import {
  Bar,
  ComposedChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatINRWhole } from "@/lib/invoice-calc";
import type { PeriodKey } from "@/lib/date-range-filter";
import { buildMonthlyChartForPeriod, cashFlowWeekDetails, type CashFlowLine } from "@/lib/analytics";
import type { OperationsData } from "@/lib/types";

type HoveredWeek = {
  label: string;
  income: number;
  expenses: number;
  net: number;
  x: number;
};

type SelectedWeek = {
  label: string;
  sortKey: string;
  income: number;
  expenses: number;
  net: number;
};

function LineList({
  title,
  tone,
  lines,
  empty,
}: {
  title: string;
  tone: "income" | "expense";
  lines: CashFlowLine[];
  empty: string;
}) {
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  const color = tone === "income" ? "text-emerald-400" : "text-rose-400";
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className={`text-sm font-semibold ${color}`}>{title}</h3>
        <p className={`text-sm font-semibold tabular-nums ${color}`}>{formatINRWhole(total)}</p>
      </div>
      {lines.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {lines.map((line, index) => (
            <li
              key={`${line.name}-${line.date}-${index}`}
              className="flex items-start justify-between gap-3 text-xs"
            >
              <span className="min-w-0 text-foreground">{line.name}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatINRWhole(line.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MonthlyIncomeExpenseChart({
  ops,
  period = "all",
  month,
}: {
  ops: OperationsData;
  period?: PeriodKey;
  month?: string;
}) {
  const chartData = buildMonthlyChartForPeriod(ops, period, month);
  const [hover, setHover] = useState<HoveredWeek | null>(null);
  const [selected, setSelected] = useState<SelectedWeek | null>(null);

  const details = useMemo(
    () => (selected ? cashFlowWeekDetails(ops, selected.sortKey) : { income: [], expenses: [] }),
    [ops, selected],
  );

  if (chartData.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center rounded-lg border border-dashed border-border bg-muted/10">
        <p className="text-sm text-muted-foreground">
          No activity this month.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={chartData}
          margin={{ top: 12, right: 12, left: 4, bottom: 4 }}
          className="cursor-pointer"
          onMouseMove={(state) => {
            if (selected) return;
            const row = state.activePayload?.[0]?.payload as
              | {
                  month?: string;
                  income?: number;
                  expenses?: number;
                  net?: number;
                  sortKey?: string;
                }
              | undefined;
            const x = state.activeCoordinate?.x;
            if (!row || typeof x !== "number") {
              setHover(null);
              return;
            }
            setHover({
              label: row.month ?? String(state.activeLabel ?? ""),
              income: row.income ?? 0,
              expenses: row.expenses ?? 0,
              net: row.net ?? 0,
              x,
            });
          }}
          onMouseLeave={() => setHover(null)}
          onClick={(state) => {
            const row = state?.activePayload?.[0]?.payload as
              | {
                  month?: string;
                  income?: number;
                  expenses?: number;
                  net?: number;
                  sortKey?: string;
                }
              | undefined;
            if (!row?.sortKey) return;
            setHover(null);
            setSelected({
              label: row.month ?? "",
              sortKey: row.sortKey,
              income: row.income ?? 0,
              expenses: row.expenses ?? 0,
              net: row.net ?? 0,
            });
          }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/50" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval={0}
            angle={chartData.length > 6 ? -35 : 0}
            textAnchor={chartData.length > 6 ? "end" : "middle"}
            height={chartData.length > 6 ? 56 : 28}
            className="text-muted-foreground"
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
            className="text-muted-foreground"
            width={52}
          />
          <Legend
            verticalAlign="top"
            align="right"
            iconType="circle"
            wrapperStyle={{ fontSize: "12px", paddingBottom: "12px" }}
          />
          <Bar
            dataKey="income"
            name="Money in"
            fill="#34d399"
            radius={[4, 4, 0, 0]}
            maxBarSize={36}
            isAnimationActive={false}
          />
          <Bar
            dataKey="expenses"
            name="Money out"
            fill="#fb7185"
            radius={[4, 4, 0, 0]}
            maxBarSize={36}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="net"
            name="Net"
            stroke="#38bdf8"
            strokeWidth={2}
            isAnimationActive={false}
            dot={{ r: 3, fill: "#38bdf8", stroke: "#38bdf8" }}
            activeDot={{ r: 5, fill: "#38bdf8", stroke: "hsl(var(--card))", strokeWidth: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      {hover && !selected && (
        <div
          className="pointer-events-none absolute top-2 z-20 min-w-[10.5rem] rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg"
          style={{
            left: hover.x,
            transform: "translateX(-50%)",
          }}
        >
          <p className="mb-1 font-semibold text-foreground">{hover.label}</p>
          <p className="text-emerald-400">Money in : {formatINRWhole(hover.income)}</p>
          <p className="text-rose-400">Money out : {formatINRWhole(hover.expenses)}</p>
          <p className="text-sky-400">Net : {formatINRWhole(hover.net)}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">Click for names</p>
        </div>
      )}
      <Dialog open={selected != null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selected?.label ?? "Week"}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-5">
              <LineList
                title="Money in"
                tone="income"
                lines={details.income}
                empty="No money in this week."
              />
              <LineList
                title="Money out"
                tone="expense"
                lines={details.expenses}
                empty="No money out this week."
              />
              <p className="border-t border-border pt-3 text-sm font-semibold text-sky-400">
                Net :{" "}
                {formatINRWhole(
                  details.income.reduce((sum, line) => sum + line.amount, 0) -
                    details.expenses.reduce((sum, line) => sum + line.amount, 0),
                )}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
