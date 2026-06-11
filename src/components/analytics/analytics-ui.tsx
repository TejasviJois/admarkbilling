import { Link } from "@tanstack/react-router";
import { ChevronLeft, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/operations/operations-ui";

export function AnalyticsPageHeader({
  title,
  description,
  backTo = "/analytics",
}: {
  title: string;
  description: string;
  backTo?: string;
}) {
  return (
    <div className="mb-8">
      <Link
        to={backTo}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to analytics
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-[15px]">
        {description}
      </p>
    </div>
  );
}

export function AnalyticsSearch({
  value,
  onChange,
  placeholder = "Search…",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
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
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6">
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
  items: { label: string; value: string; tone?: "positive" | "negative" | "neutral" }[];
}) {
  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border border-border bg-muted/20 px-4 py-3"
        >
          <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
          <p
            className={`mt-1 text-lg font-semibold tabular-nums ${
              item.tone === "positive"
                ? "text-emerald-300"
                : item.tone === "negative"
                  ? "text-rose-400"
                  : "text-foreground"
            }`}
          >
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}
