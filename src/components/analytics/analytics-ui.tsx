import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { ChevronLeft, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchWithPeriodFilter } from "@/components/operations/SearchWithPeriodFilter";
import { DataTable } from "@/components/operations/operations-ui";
import { DEFAULT_PERIOD, ANALYTICS_PERIOD_OPTIONS, type PeriodKey } from "@/lib/date-range-filter";
import { cn } from "@/lib/utils";

export function AnalyticsPageHeader({
  title,
  description,
  backTo = "/analytics",
  action,
}: {
  title: string;
  description?: string;
  backTo?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {backTo !== "/analytics" && (
          <Link
            to={backTo}
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to analytics
          </Link>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{title}</h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-[15px]">
            {description}
          </p>
        )}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function AnalyticsPeriodFilter({
  period,
  onPeriodChange,
  className,
}: {
  period: PeriodKey;
  onPeriodChange: (value: PeriodKey) => void;
  className?: string;
}) {
  return (
    <Select value={period} onValueChange={(v) => onPeriodChange(v as PeriodKey)}>
      <SelectTrigger className={cn("h-9 w-[9rem]", className)} aria-label="Time period">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ANALYTICS_PERIOD_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function AnalyticsSearch({
  value,
  onChange,
  placeholder = "Search…",
  period,
  onPeriodChange,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  period?: PeriodKey;
  onPeriodChange?: (value: PeriodKey) => void;
}) {
  if (period !== undefined && onPeriodChange) {
    return (
      <SearchWithPeriodFilter
        search={value}
        onSearchChange={onChange}
        period={period}
        onPeriodChange={onPeriodChange}
        placeholder={placeholder}
        className="mb-5 max-w-xl"
      />
    );
  }

  return (
    <div className="relative mb-5 max-w-md">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9"
        aria-label="Search"
      />
    </div>
  );
}

export function AnalyticsKpiGrid({
  items,
}: {
  items: {
    label: string;
    value: string;
    icon: LucideIcon;
    tone?: "positive" | "negative" | "neutral" | "accent";
    hint?: string;
    to?: string;
  }[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        const valueClass =
          item.tone === "positive"
            ? "text-emerald-400"
            : item.tone === "negative"
              ? "text-rose-400"
              : item.tone === "accent"
                ? "text-sky-300"
                : "text-foreground";
        const iconClass =
          item.tone === "positive"
            ? "text-emerald-400/80"
            : item.tone === "negative"
              ? "text-rose-400/80"
              : item.tone === "accent"
                ? "text-sky-400/80"
                : "text-primary/80";

        const body = (
          <>
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {item.label}
              </p>
              <Icon className={cn("h-4 w-4 shrink-0", iconClass)} aria-hidden />
            </div>
            <p className={cn("mt-2 text-xl font-semibold tabular-nums sm:text-2xl", valueClass)}>
              {item.value}
            </p>
            {item.hint && <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{item.hint}</p>}
          </>
        );

        if (item.to) {
          return (
            <Link
              key={item.label}
              to={item.to}
              className="group rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
            >
              {body}
            </Link>
          );
        }

        return (
          <div
            key={item.label}
            className="rounded-xl border border-border bg-card p-4 shadow-sm"
          >
            {body}
          </div>
        );
      })}
    </div>
  );
}

export function AnalyticsQuickLinks({
  links,
}: {
  links: { label: string; description: string; to: string; hash?: string }[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {links.map((link) => (
        <Link
          key={link.to + (link.hash ?? "")}
          to={link.to}
          hash={link.hash}
          className="group rounded-xl border border-border bg-muted/10 p-4 transition-colors hover:border-primary/30 hover:bg-muted/20"
        >
          <p className="font-medium text-foreground group-hover:text-primary">{link.label}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{link.description}</p>
        </Link>
      ))}
    </div>
  );
}

export function AnalyticsTableSection({
  title,
  description,
  search,
  headers,
  rows,
  emptyMessage,
}: {
  title: string;
  description: string;
  search?: React.ReactNode;
  headers: string[];
  rows: React.ReactNode[][];
  emptyMessage: string;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {search ? <div className="mb-5">{search}</div> : null}
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <DataTable headers={headers} rows={rows} />
      )}
    </section>
  );
}

export function AnalyticsSummaryCards({
  items,
}: {
  items: {
    label: string;
    value: string;
    tone?: "positive" | "negative" | "neutral";
    hint?: string;
    onClick?: () => void;
  }[];
}) {
  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => {
        const valueClass =
          item.tone === "positive"
            ? "text-emerald-300"
            : item.tone === "negative"
              ? "text-rose-400"
              : "text-foreground";
        const inner = (
          <>
            <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
            <p className={`mt-1 text-lg font-semibold tabular-nums ${valueClass}`}>{item.value}</p>
            {item.hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{item.hint}</p>}
            {item.onClick && (
              <p className="mt-1 text-[11px] font-medium text-primary">Tap for breakdown</p>
            )}
          </>
        );
        if (item.onClick) {
          return (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/35"
            >
              {inner}
            </button>
          );
        }
        return (
          <div key={item.label} className="rounded-lg border border-border bg-muted/20 px-4 py-3">
            {inner}
          </div>
        );
      })}
    </div>
  );
}

export { DEFAULT_PERIOD };
