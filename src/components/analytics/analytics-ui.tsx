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
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {backTo !== "/analytics" && (
          <Link
            to={backTo}
            className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to analytics
          </Link>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Quiet chapter — top-to-bottom reading order without heavy chrome. */
export function AnalyticsChapter({
  step,
  title,
  subtitle,
  children,
  className,
}: {
  step: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4", className)}>
      <header className="space-y-1 border-b border-border/80 pb-3">
        <div className="flex items-baseline gap-2.5">
          <span className="text-[11px] font-medium tabular-nums text-muted-foreground/70">
            {step}
          </span>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
        </div>
        {subtitle ? (
          <p className="pl-[1.65rem] text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </header>
      {children}
    </section>
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
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
    <div className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border/80 bg-border/80 xl:grid-cols-4", className)}>
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
            ? "text-emerald-400/70"
            : item.tone === "negative"
              ? "text-rose-400/70"
              : item.tone === "accent"
                ? "text-sky-400/70"
                : "text-muted-foreground";

        const body = (
          <>
            <div className="flex items-start justify-between gap-2">
              <p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
                {item.label}
              </p>
              <Icon className={cn("h-3.5 w-3.5 shrink-0", iconClass)} aria-hidden />
            </div>
            <p className={cn("mt-1.5 text-lg font-semibold tabular-nums sm:mt-2 sm:text-2xl", valueClass)}>
              {item.value}
            </p>
            {item.hint && (
              <p className="mt-1 text-[10px] leading-snug text-muted-foreground sm:text-[11px]">
                {item.hint}
              </p>
            )}
          </>
        );

        const cellClass =
          "bg-background p-3 transition-colors sm:p-4 hover:bg-muted/20";

        if (item.to) {
          return (
            <Link key={item.label} to={item.to} className={cn(cellClass, "group block")}>
              {body}
            </Link>
          );
        }

        return (
          <div key={item.label} className={cellClass}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
