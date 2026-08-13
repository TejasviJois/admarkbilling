import { Link, type LinkProps } from "@tanstack/react-router";
import { ChevronRight, FolderOpen } from "lucide-react";

export function DocumentsBreadcrumb({
  items,
}: {
  items: { label: string; to?: LinkProps["to"] }[];
}) {
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
  to: LinkProps["to"];
  title: string;
  description: string;
  stat?: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="group flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card p-4 text-center shadow-sm transition-shadow hover:shadow-md"
    >
      <span className="text-primary">{icon}</span>
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{description}</p>
      {stat && <p className="text-xs font-medium text-muted-foreground">{stat}</p>}
    </Link>
  );
}

export function FolderTile({
  to,
  params,
  title,
  subtitle,
}: {
  to: LinkProps["to"];
  params?: LinkProps["params"];
  title: string;
  subtitle?: string;
}) {
  return (
    <Link
      to={to}
      params={params}
      className="group flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card p-3 text-center shadow-sm transition-shadow hover:shadow-md"
    >
      <FolderOpen className="h-8 w-8 shrink-0 text-primary" />
      <p className="line-clamp-2 w-full text-sm font-semibold text-foreground">{title}</p>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
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
