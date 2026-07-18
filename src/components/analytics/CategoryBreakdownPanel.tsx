import type { LucideIcon } from "lucide-react";
import { formatINRWhole } from "@/lib/invoice-calc";
import type { CategoryAmountRow } from "@/lib/analytics";
import { cn } from "@/lib/utils";

export function CategoryBreakdownPanel({
  title,
  description,
  rows,
  total,
  tone,
  emptyMessage,
  icon: Icon,
  maxRows = 8,
}: {
  title: string;
  description: string;
  rows: CategoryAmountRow[];
  total: number;
  tone: "income" | "expense";
  emptyMessage: string;
  icon?: LucideIcon;
  maxRows?: number;
}) {
  const barClass = tone === "income" ? "bg-emerald-500" : "bg-rose-500";
  const barGlow =
    tone === "income"
      ? "shadow-[0_0_12px_rgba(52,211,153,0.25)]"
      : "shadow-[0_0_12px_rgba(251,113,133,0.2)]";
  const amountClass = tone === "income" ? "text-emerald-400" : "text-rose-400";
  const ringClass = tone === "income" ? "ring-emerald-500/20" : "ring-rose-500/20";
  const visible = rows.slice(0, maxRows);
  const hidden = rows.length - visible.length;

  if (rows.length === 0 || total <= 0) {
    return (
      <section className="flex h-full flex-col rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <PanelHeader title={title} description={description} icon={Icon} />
        <p className="mt-auto py-10 text-center text-sm text-muted-foreground">{emptyMessage}</p>
      </section>
    );
  }

  return (
    <section
      className={cn(
        "rounded-xl border border-border bg-card p-5 shadow-sm ring-1 ring-inset sm:p-6",
        ringClass,
      )}
    >
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <PanelHeader title={title} description={description} icon={Icon} />
        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total</p>
          <p className={cn("text-xl font-semibold tabular-nums sm:text-2xl", amountClass)}>
            {formatINRWhole(total)}
          </p>
        </div>
      </div>
      <ul className="space-y-5">
        {visible.map((row, index) => {
          const pct = total > 0 ? (row.amount / total) * 100 : 0;
          return (
            <li key={row.key}>
              <div className="mb-2 flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted/60 text-[11px] font-semibold tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate font-medium text-foreground">{row.label}</p>
                    <p className={cn("shrink-0 text-sm font-semibold tabular-nums", amountClass)}>
                      {formatINRWhole(row.amount)}
                    </p>
                  </div>
                  {row.hint && <p className="mt-0.5 text-xs text-muted-foreground">{row.hint}</p>}
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted/50">
                      <div
                        className={cn("h-full rounded-full transition-all", barClass, barGlow)}
                        style={{ width: `${Math.max(pct, row.amount > 0 ? 3 : 0)}%` }}
                      />
                    </div>
                    <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {Math.round(pct)}%
                    </span>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {hidden > 0 && (
        <p className="mt-4 text-center text-xs text-muted-foreground">+ {hidden} more not shown</p>
      )}
    </section>
  );
}

function PanelHeader({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex items-start gap-3">
      {Icon && (
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/40">
          <Icon className="h-4 w-4 text-primary" aria-hidden />
        </span>
      )}
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
