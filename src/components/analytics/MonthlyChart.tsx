import {
  Bar,
  ComposedChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatINRWhole } from "@/lib/invoice-calc";
import type { PeriodKey } from "@/lib/date-range-filter";
import { buildMonthlyChartForPeriod } from "@/lib/analytics";
import type { OperationsData } from "@/lib/types";

export function MonthlyIncomeExpenseChart({
  ops,
  period = "all",
}: {
  ops: OperationsData;
  period?: PeriodKey;
}) {
  const chartData = buildMonthlyChartForPeriod(ops, period);

  if (chartData.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center rounded-lg border border-dashed border-border bg-muted/10">
        <p className="text-sm text-muted-foreground">
          No activity in this period — record payments or expenses to see trends.
        </p>
      </div>
    );
  }

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 12, right: 12, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/50" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
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
          <Tooltip
            formatter={(value: number, name: string) => [formatINRWhole(value), name]}
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "10px",
              fontSize: "12px",
            }}
            labelStyle={{ fontWeight: 600, marginBottom: 4 }}
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
          />
          <Bar
            dataKey="expenses"
            name="Money out"
            fill="#fb7185"
            radius={[4, 4, 0, 0]}
            maxBarSize={36}
          />
          <Line
            type="monotone"
            dataKey="net"
            name="Net"
            stroke="#38bdf8"
            strokeWidth={2}
            dot={{ r: 3, fill: "#38bdf8" }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
