import { Link, type LinkProps } from "@tanstack/react-router";
import {
  ArrowRight,
  Archive,
  Building2,
  ChevronLeft,
  ChevronRight,
  FileSignature,
  FileText,
  FolderOpen,
  Landmark,
  LayoutGrid,
  List,
  MoreHorizontal,
  Trash2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ArchiveDocument, ArchiveDocumentType } from "@/lib/types";
import { companyFolderKey, documentTypeLabel, isPreClientLibrary } from "@/lib/document-vault";

export function DocumentsBreadcrumb({
  items,
}: {
  items: { label: string; to?: LinkProps["to"] }[];
}) {
  return (
    <nav className="mb-4 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="inline-flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 opacity-50" aria-hidden />}
          {item.to ? (
            <Link to={item.to} className="transition-colors hover:text-foreground">
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

/** Quiet directory row — used by payments hub and similar lists. */
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
      className="group flex flex-col justify-between rounded-2xl border border-white/10 glass-panel p-5 transition-all duration-300 hover:border-white/25 hover:scale-[1.01] hover:shadow-xl"
    >
      <div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/70 transition-all duration-300 group-hover:border-[#ff6b2b]/40 group-hover:bg-[#ff6b2b]/10 group-hover:text-[#ff6b2b]">
          {icon}
        </span>
        <h3 className="mt-4 truncate text-base font-bold text-white group-hover:text-white">{title}</h3>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/50">{description}</p>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3">
        {stat ? (
          <span className="truncate text-xs font-mono text-white/40">{stat}</span>
        ) : <span />}
        <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-white/60 transition-colors group-hover:border-[#ff6b2b]/40 group-hover:text-[#ff6b2b]">
          <ChevronRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}

/** Company / client folder — directory row (list pages). */
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
      className="group flex items-center gap-3.5 rounded-xl border border-white/10 glass-card px-4 py-3.5 transition-all duration-200 hover:border-white/25 hover:bg-white/[0.04]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-white/60 transition-colors group-hover:border-[#ff6b2b]/40 group-hover:text-[#ff6b2b]">
        <FolderOpen className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-white group-hover:text-white">{title}</span>
        {subtitle ? (
          <span className="mt-0.5 block truncate text-xs text-white/50">{subtitle}</span>
        ) : null}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-white/40 transition-transform group-hover:translate-x-0.5 group-hover:text-white" />
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
      className={cn(
        "group flex items-center justify-between gap-4 rounded-xl border border-white/10 glass-card px-4 py-3.5 transition-all duration-200 hover:border-white/25 hover:bg-white/[0.04]",
      )}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-white group-hover:text-white">{title}</p>
        {subtitle ? (
          <p className="mt-0.5 truncate text-xs text-white/50">{subtitle}</p>
        ) : null}
        {meta ? <p className="mt-0.5 text-xs text-white/40 font-mono">{meta}</p> : null}
        {proofHint ? <p className="mt-0.5 text-xs text-emerald-400 font-medium">{proofHint}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {amount ? (
          <span className="text-sm font-bold tabular-nums text-white">{amount}</span>
        ) : null}
        <ChevronRight className="h-4 w-4 text-white/40 transition-transform group-hover:translate-x-0.5 group-hover:text-white" />
      </div>
    </Link>
  );
}

/* ─── Hub (reference mock) ─────────────────────────────────────────── */

type HubAccent = "rose" | "violet" | "amber" | "sky" | "emerald";

const ACCENT: Record<
  HubAccent,
  { iconWrap: string; icon: string; badge: string; soft: string }
> = {
  rose: {
    iconWrap: "bg-rose-500/10",
    icon: "text-rose-400",
    badge: "bg-rose-500/10 text-rose-400",
    soft: "text-rose-400",
  },
  violet: {
    iconWrap: "bg-violet-500/10",
    icon: "text-violet-400",
    badge: "bg-violet-500/10 text-violet-400",
    soft: "text-violet-400",
  },
  amber: {
    iconWrap: "bg-amber-500/10",
    icon: "text-amber-400",
    badge: "bg-amber-500/10 text-amber-400",
    soft: "text-amber-400",
  },
  sky: {
    iconWrap: "bg-sky-500/10",
    icon: "text-sky-400",
    badge: "bg-sky-500/10 text-sky-400",
    soft: "text-sky-400",
  },
  emerald: {
    iconWrap: "bg-emerald-500/10",
    icon: "text-emerald-400",
    badge: "bg-emerald-500/10 text-emerald-400",
    soft: "text-emerald-400",
  },
};

function typeAccent(type: ArchiveDocumentType, library?: string): HubAccent {
  if (library === "vault") return "amber";
  switch (type) {
    case "proposal":
      return "rose";
    case "quotation":
      return "sky";
    case "agreement":
      return "emerald";
    case "technical":
      return "amber";
    case "handover":
      return "sky";
    case "write_off":
      return "rose";
    case "annexure":
      return "violet";
    default:
      return "violet";
  }
}

export function formatRelativeUpdated(ts: number): { long: string; short: string } {
  const diff = Math.max(0, Date.now() - ts);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return { long: "Updated just now", short: "now" };
  if (mins < 60) return { long: `Updated ${mins} min ago`, short: `${mins}m ago` };
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return {
      long: `Updated ${hours} hour${hours === 1 ? "" : "s"} ago`,
      short: `${hours}h ago`,
    };
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return {
      long: `Updated ${days} day${days === 1 ? "" : "s"} ago`,
      short: `${days}d ago`,
    };
  }
  const weeks = Math.floor(days / 7);
  if (weeks < 5) {
    return {
      long: `Updated ${weeks} week${weeks === 1 ? "" : "s"} ago`,
      short: `${weeks}w ago`,
    };
  }
  const date = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
  }).format(new Date(ts));
  return { long: `Updated ${date}`, short: date };
}

export function documentOpenHref(doc: ArchiveDocument): {
  to: LinkProps["to"];
  params?: LinkProps["params"];
} {
  if (doc.library === "vault") return { to: "/documents/vault" };
  if (doc.library === "client" && doc.clientId) {
    return { to: "/documents/clients/$id", params: { id: doc.clientId } };
  }
  if (isPreClientLibrary(doc.library) && doc.companyName) {
    return {
      to: "/documents/proposals/$companyKey",
      params: { companyKey: companyFolderKey(doc.companyName) },
    };
  }
  return { to: "/documents/proposals" };
}

export function LibraryHubCard({
  to,
  title,
  description,
  stat,
  accent,
  icon,
}: {
  to: LinkProps["to"];
  title: string;
  description: string;
  stat: React.ReactNode;
  accent: HubAccent;
  icon: React.ReactNode;
}) {
  const a = ACCENT[accent];
  return (
    <Link
      to={to}
      className="group relative flex min-h-[175px] flex-col rounded-2xl border border-white/10 glass-panel p-5 transition-all duration-300 hover:border-white/25 hover:scale-[1.01] hover:shadow-2xl"
    >
      <span
        className={cn(
          "mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 shadow-sm",
          a.iconWrap,
          a.icon,
        )}
      >
        {icon}
      </span>
      <h3 className="text-base font-bold tracking-tight text-white group-hover:text-white transition-colors">{title}</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-white/60">{description}</p>
      <div className="mt-auto flex items-end justify-between gap-3 pt-5 border-t border-white/5">
        <p className="text-xs font-mono text-white/40">{stat}</p>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/60 transition-all group-hover:border-[#ff6b2b]/40 group-hover:bg-[#ff6b2b]/10 group-hover:text-[#ff6b2b]">
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
}

export function ArchiveHubCard({
  to,
  title,
  description,
  accent,
  icon,
  watermark,
}: {
  to: LinkProps["to"];
  title: string;
  description: string;
  accent: HubAccent;
  icon: React.ReactNode;
  watermark: React.ReactNode;
}) {
  const a = ACCENT[accent];
  return (
    <Link
      to={to}
      className="group relative flex min-h-[150px] overflow-hidden rounded-2xl border border-white/10 glass-panel p-5 transition-all duration-300 hover:border-white/25 hover:scale-[1.01] hover:shadow-xl"
    >
      <div className="relative z-10 flex max-w-[70%] flex-col">
        <span
          className={cn(
            "mb-3 flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 shadow-sm",
            a.iconWrap,
            a.icon,
          )}
        >
          {icon}
        </span>
        <h3 className="text-base font-bold tracking-tight text-white">{title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-white/60">{description}</p>
        <span className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-semibold text-white transition-all group-hover:border-white/20 group-hover:bg-white/[0.08]">
          Open archive
          <ArrowRight className="h-3 w-3" />
        </span>
      </div>
      <div
        className="pointer-events-none absolute -bottom-4 -right-2 opacity-[0.08] transition-opacity group-hover:opacity-[0.15]"
        aria-hidden
      >
        {watermark}
      </div>
    </Link>
  );
}

export function RecentDocumentRow({
  document,
  href,
}: {
  document: ArchiveDocument;
  href: { to: LinkProps["to"]; params?: LinkProps["params"] };
}) {
  const accent = typeAccent(document.documentType, document.library);
  const a = ACCENT[accent];
  const rel = formatRelativeUpdated(document.updatedAt);
  const company =
    document.companyName || document.clientName || (document.library === "vault" ? "Admark" : "—");
  const label = documentTypeLabel(document);

  return (
    <Link
      to={href.to}
      params={href.params}
      className="group flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-white/[0.02]"
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 shadow-sm",
          a.iconWrap,
          a.icon,
        )}
      >
        <FileText className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-white">{document.title}</span>
        <span className="mt-0.5 block truncate text-xs text-white/50">
          {company} · {rel.long}
        </span>
      </span>
      <span
        className={cn(
          "hidden shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider border border-white/10 sm:inline-flex",
          a.badge,
        )}
      >
        {label}
      </span>
      <span className="hidden w-16 shrink-0 text-right text-xs font-mono text-white/40 md:block">
        {rel.short}
      </span>
      <span className="rounded-xl p-1.5 text-white/40 opacity-50 group-hover:opacity-100 group-hover:text-white transition-opacity">
        <MoreHorizontal className="h-4 w-4" />
      </span>
    </Link>
  );
}

/** Company folder card — matches proposals reference grid. */
export function CompanyFolderRow({
  to,
  params,
  title,
  fileCount,
  updatedAt,
  layout = "grid",
  accent = "rose",
}: {
  to: LinkProps["to"];
  params?: LinkProps["params"];
  title: string;
  fileCount: number;
  updatedAt: number;
  layout?: "grid" | "list";
  accent?: HubAccent;
}) {
  const a = ACCENT[accent];
  const rel = formatRelativeUpdated(updatedAt);
  const files = `${fileCount} file${fileCount === 1 ? "" : "s"}`;

  if (layout === "list") {
    return (
      <Link
        to={to}
        params={params}
        className="group flex items-center gap-3 rounded-xl border border-border/80 bg-card/40 px-4 py-3.5 transition-colors hover:border-border hover:bg-card/70"
      >
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            a.iconWrap,
            a.icon,
          )}
        >
          <FolderOpen className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">{title}</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {files} · {rel.short}
          </span>
        </span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/80 text-muted-foreground transition-colors group-hover:border-border group-hover:text-foreground">
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </Link>
    );
  }

  return (
    <Link
      to={to}
      params={params}
      className="group relative flex min-h-[148px] flex-col rounded-xl border border-border/80 bg-card/40 p-4 transition-colors hover:border-border hover:bg-card/70"
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg",
            a.iconWrap,
            a.icon,
          )}
        >
          <FolderOpen className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <span
          className="rounded-md p-1 text-muted-foreground opacity-50 transition-opacity group-hover:opacity-100"
          aria-hidden
        >
          <MoreHorizontal className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-auto min-w-0 pt-6">
        <p className="line-clamp-2 text-sm font-semibold tracking-tight text-foreground">{title}</p>
        <div className="mt-2 flex items-end justify-between gap-2">
          <p className="truncate text-xs text-muted-foreground">
            {files} · {rel.short}
          </p>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/80 text-muted-foreground transition-colors group-hover:border-border group-hover:text-foreground">
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

/** File card for vault / folder interiors. */
export function DocumentFileCard({
  title,
  meta,
  updatedAt,
  accent = "amber",
  layout = "grid",
  typeLabel,
  assigneeName,
  assigneeInitials,
  fileSizeLabel,
  onOpen,
  onRemove,
}: {
  title: string;
  meta?: string;
  updatedAt: number;
  accent?: HubAccent;
  layout?: "grid" | "list";
  typeLabel?: string;
  assigneeName?: string;
  assigneeInitials?: string;
  fileSizeLabel?: string;
  onOpen: () => void;
  onRemove?: () => void;
}) {
  const a = ACCENT[accent];
  const rel = formatRelativeUpdated(updatedAt);

  if (layout === "list") {
    return (
      <div className="group flex items-center gap-3 border-b border-border/80 py-3.5 last:border-b-0">
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
              a.iconWrap,
              a.icon,
            )}
          >
            <FileText className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="truncate text-sm font-semibold text-foreground">{title}</span>
              {typeLabel ? (
                <span className="shrink-0 rounded-md bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {typeLabel}
                </span>
              ) : null}
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{rel.long}</span>
          </span>
          {(assigneeName || assigneeInitials) && (
            <span className="hidden shrink-0 items-center gap-2 sm:flex">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground">
                {assigneeInitials || "?"}
              </span>
              <span className="max-w-[7rem] truncate text-xs text-muted-foreground">
                {assigneeName}
              </span>
            </span>
          )}
          <span className="hidden w-14 shrink-0 text-right text-xs text-muted-foreground md:block">
            {rel.short}
          </span>
          {fileSizeLabel ? (
            <span className="hidden w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground lg:block">
              {fileSizeLabel}
            </span>
          ) : null}
        </button>
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-md p-1.5 text-muted-foreground opacity-50 transition-opacity hover:bg-rose-500/10 hover:text-rose-400 group-hover:opacity-100"
            title="Remove"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span className="rounded-md p-1.5 text-muted-foreground opacity-40" aria-hidden>
            <MoreHorizontal className="h-4 w-4" />
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="group relative flex min-h-[148px] flex-col rounded-xl border border-border/80 bg-card/40 p-4 transition-colors hover:border-border hover:bg-card/70">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg",
            a.iconWrap,
            a.icon,
          )}
        >
          <FileText className="h-4 w-4" />
        </button>
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-rose-500/10 hover:text-rose-400 group-hover:opacity-100"
            title="Remove"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span className="rounded-md p-1 text-muted-foreground opacity-50" aria-hidden>
            <MoreHorizontal className="h-4 w-4" />
          </span>
        )}
      </div>
      <button type="button" onClick={onOpen} className="mt-auto min-w-0 pt-6 text-left">
        <p className="line-clamp-2 text-sm font-semibold tracking-tight text-foreground">{title}</p>
        {typeLabel ? (
          <span className="mt-1.5 inline-flex rounded-md bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {typeLabel}
          </span>
        ) : null}
        <div className="mt-2 flex items-end justify-between gap-2">
          <p className="truncate text-xs text-muted-foreground">
            {assigneeName || meta || rel.short}
          </p>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/80 text-muted-foreground">
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </button>
    </div>
  );
}

export function FolderViewToggle({
  view,
  onChange,
}: {
  view: "grid" | "list";
  onChange: (view: "grid" | "list") => void;
}) {
  return (
    <div className="inline-flex items-center rounded-lg border border-border/80 bg-card/30 p-0.5">
      <button
        type="button"
        aria-label="Grid view"
        aria-pressed={view === "grid"}
        onClick={() => onChange("grid")}
        className={cn(
          "rounded-md p-1.5 transition-colors",
          view === "grid"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label="List view"
        aria-pressed={view === "list"}
        onClick={() => onChange("list")}
        className={cn(
          "rounded-md p-1.5 transition-colors",
          view === "list"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <List className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function FolderPagination({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);

  return (
    <nav className="flex items-center justify-center gap-1 pt-2" aria-label="Pagination">
      <button
        type="button"
        aria-label="Previous page"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      {pages.map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`Page ${n}`}
          aria-current={n === page ? "page" : undefined}
          onClick={() => onPageChange(n)}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-md text-xs font-medium transition-colors",
            n === page
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
          )}
        >
          {n}
        </button>
      ))}
      <button
        type="button"
        aria-label="Next page"
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
        className="rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}

export const HUB_ICONS = {
  proposals: <FileText className="h-5 w-5" strokeWidth={1.75} />,
  clients: <Users className="h-5 w-5" strokeWidth={1.75} />,
  vault: <Landmark className="h-5 w-5" strokeWidth={1.75} />,
  invoices: <FileText className="h-5 w-5" strokeWidth={1.75} />,
  agreements: <Archive className="h-5 w-5" strokeWidth={1.75} />,
  folder: <FolderOpen className="h-5 w-5" strokeWidth={1.75} />,
  invoiceWatermark: <FileText className="h-36 w-36" strokeWidth={1} />,
  agreementWatermark: <FileSignature className="h-36 w-36" strokeWidth={1} />,
  building: <Building2 className="h-5 w-5" strokeWidth={1.75} />,
};
