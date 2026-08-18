import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { ChevronLeft } from "lucide-react";
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
        <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          {title}
        </h1>
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

export function AnalyticsKpiSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function AnalyticsKpiGrid({
  items,
  className,
}: {
  items: {
    label: string;
    value: string;
    icon: LucideIcon;
    tone?: "positive" | "negative" | "neutral" | "accent";
    hint?: string;
    to?: string;
  }[];
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4", className)}>
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
              <p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
                {item.label}
              </p>
              <Icon className={cn("h-4 w-4 shrink-0", iconClass)} aria-hidden />
            </div>
            <p className={cn("mt-1.5 text-lg font-semibold tabular-nums sm:mt-2 sm:text-2xl", valueClass)}>
              {item.value}
            </p>
            {item.hint && (
              <p className="mt-1 text-[10px] leading-snug text-muted-foreground sm:text-[11px]">{item.hint}</p>
            )}
          </>
        );

        if (item.to) {
          return (
            <Link
              key={item.label}
              to={item.to}
              className="group rounded-xl border border-border bg-card p-3 shadow-sm transition-all hover:border-primary/30 hover:shadow-md sm:p-4"
            >
              {body}
            </Link>
          );
        }

        return (
          <div key={item.label} className="rounded-xl border border-border bg-card p-3 shadow-sm sm:p-4">
            {body}
          </div>
        );
      })}
    </div>
  );
}
