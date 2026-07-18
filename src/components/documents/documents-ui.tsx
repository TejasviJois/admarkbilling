import { Link, type LinkProps } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

export function DocumentsBreadcrumb({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav className="mb-6 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="inline-flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />}
          {item.to ? (
            <Link to={item.to} className="font-medium text-primary hover:underline">
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-foreground">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function DocumentHubCard({
  to,
  title,
  description,
  stat,
  icon,
}: {
  to: string;
  title: string;
  description: string;
  stat?: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="group block rounded-lg border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 text-primary">{icon}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
          {stat && <p className="mt-3 text-xs font-medium text-muted-foreground">{stat}</p>}
        </div>
        <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </Link>
  );
}

export function EntityListCard({
  to,
  params,
  title,
  subtitle,
  amount,
  meta,
  proofHint,
}: {
  to: LinkProps["to"];
  params?: LinkProps["params"];
  title: string;
  subtitle?: string;
  amount?: string;
  meta?: string;
  proofHint?: string;
}) {
  return (
    <Link
      to={to}
      params={params}
      className="group flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-4 shadow-sm transition-shadow hover:shadow-md sm:px-5"
    >
      <div className="min-w-0">
        <p className="truncate font-semibold text-foreground">{title}</p>
        {subtitle && <p className="mt-0.5 truncate text-sm text-muted-foreground">{subtitle}</p>}
        {meta && <p className="mt-1 text-xs text-muted-foreground">{meta}</p>}
        {proofHint && <p className="mt-1 text-xs font-medium text-emerald-400/90">{proofHint}</p>}
      </div>{" "}
      <div className="flex shrink-0 items-center gap-2">
        {amount && (
          <span className="text-sm font-semibold tabular-nums text-foreground">{amount}</span>
        )}
        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </Link>
  );
}
