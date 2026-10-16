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
            className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/50 transition-colors hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to analytics
          </Link>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-white/60">
            {description}
          </p>
        )}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Quiet chapter — top-to-bottom reading order with frosted glass panel. */
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
    <section className={cn("glass-panel rounded-3xl p-6 border border-white/10 space-y-5 shadow-2xl", className)}>
      <header className="space-y-1 border-b border-white/10 pb-4">
        <div className="flex items-baseline gap-2.5">
          <span className="text-xs font-bold tabular-nums px-2 py-0.5 rounded-full bg-white/5 text-[#ff6b2b] border border-[#ff6b2b]/20">
            {step}
          </span>
          <h2 className="text-lg font-bold tracking-tight text-white">{title}</h2>
        </div>
        {subtitle ? (
          <p className="pl-[2rem] text-xs text-white/50">{subtitle}</p>
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
      <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40">
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
    <div className={cn("grid grid-cols-2 gap-3 xl:grid-cols-4", className)}>
      {items.map((item) => {
        const Icon = item.icon;
        const valueClass =
          item.tone === "positive"
            ? "text-emerald-400"
            : item.tone === "negative"
              ? "text-rose-400"
              : item.tone === "accent"
                ? "text-sky-400"
                : "text-white";
        const iconClass =
          item.tone === "positive"
            ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
            : item.tone === "negative"
              ? "text-rose-400 bg-rose-500/10 border-rose-500/20"
              : item.tone === "accent"
                ? "text-sky-400 bg-sky-500/10 border-sky-500/20"
                : "text-white/70 bg-white/5 border-white/10";

        const body = (
          <>
            <div className="flex items-start justify-between gap-2">
              <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-white/50 sm:text-xs">
                {item.label}
              </p>
              <span className={cn("p-1.5 rounded-lg border", iconClass)}>
                <Icon className="h-4 w-4" aria-hidden />
              </span>
            </div>
            <p className={cn("mt-2 text-xl font-black tabular-nums tracking-tight sm:text-2xl", valueClass)}>
              {item.value}
            </p>
            {item.hint && (
              <p className="mt-1 text-[11px] leading-snug text-white/45">
                {item.hint}
              </p>
            )}
          </>
        );

        const cardClass =
          "glass-card rounded-2xl p-4 sm:p-5 border border-white/10 hover:border-white/20 transition-all block";

        if (item.to) {
          return (
            <Link key={item.label} to={item.to} className={cn(cardClass, "group hover:translate-y-[-2px]")}>
              {body}
            </Link>
          );
        }

        return (
          <div key={item.label} className={cardClass}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
