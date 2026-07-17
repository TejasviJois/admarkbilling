import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatINRWhole } from "@/lib/invoice-calc";
import type { ValuationSnapshot } from "@/lib/types";

export function ValuationHistoryChart({ snapshots }: { snapshots: ValuationSnapshot[] }) {
  const data = [...snapshots]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((snapshot) => ({
      ...snapshot,
      label: new Date(`${snapshot.date}T12:00:00`).toLocaleDateString("en-IN", {
        month: "short",
        year: "2-digit",
      }),
    }));

  if (data.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-lg border border-dashed border-border bg-muted/10">
        <p className="text-sm text-muted-foreground">
          Record the first monthly snapshot to begin valuation history.
        </p>
      </div>
    );
  }

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/50" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={62}
            tickFormatter={(value) => `₹${(Number(value) / 100_000).toFixed(1)}L`}
          />
          <Tooltip
            formatter={(value: number, name: string) => [formatINRWhole(value), name]}
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "10px",
              fontSize: "12px",
            }}
          />
          <Legend wrapperStyle={{ fontSize: "11px" }} />
          <Line
            type="monotone"
            dataKey="calculatedValuation"
            name="Valuation"
            stroke="#38bdf8"
            strokeWidth={2.5}
          />
          <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#34d399" strokeWidth={2} />
          <Line type="monotone" dataKey="profit" name="Profit" stroke="#f59e0b" strokeWidth={2} />
          <Line
            type="monotone"
            dataKey="netWorth"
            name="Net Worth"
            stroke="#a78bfa"
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
