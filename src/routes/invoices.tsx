import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { Plus, Search } from "lucide-react";
import { NewInvoiceLink } from "@/components/invoice/NewInvoiceLink";
import { useInvoices } from "@/hooks/use-invoices";
import { useOperations } from "@/hooks/use-operations";
import { prefetchInvoiceEditor, preloadNewInvoiceRoute } from "@/lib/prefetch-invoice-editor";
import { computeTotals, formatINR, deriveInvoiceStatus } from "@/lib/invoice-calc";
import type { Invoice } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/invoices")({
  beforeLoad: ({ context }) => prefetchInvoiceEditor(context.queryClient),
  component: InvoicesDashboard,
});

function formatDisplayDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(y, m - 1, d));
}

function statusTone(status: Invoice["status"]): string {
  switch (status) {
    case "paid":
      return "text-emerald-400";
    case "partially_paid":
      return "text-sky-400";
    case "overdue":
      return "text-rose-400";
    case "cancelled":
      return "text-muted-foreground line-through";
    case "sent":
    case "viewed":
      return "text-sky-300";
    default:
      return "text-muted-foreground";
  }
}

function statusLabel(status: Invoice["status"]): string {
  return status.replace(/_/g, " ");
}

function InvoicesDashboard() {
  const { invoices } = useInvoices();
  const { ops } = useOperations();
  const payments = ops.payments ?? [];

  useEffect(() => {
    preloadNewInvoiceRoute();
  }, []);

  const recent = useMemo(
    () =>
      invoices.slice(0, 8).map((inv) => ({
        ...inv,
        status: deriveInvoiceStatus(inv, payments),
      })),
    [invoices, payments],
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            Invoices
          </h1>
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
            Create and track invoices. Company details from Settings print on every PDF.
          </p>
          <p className="mt-2 text-xs tabular-nums text-muted-foreground">
            {invoices.length} {invoices.length === 1 ? "invoice" : "invoices"} total
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <NewInvoiceLink className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
            <Plus className="h-3.5 w-3.5" />
            New invoice
          </NewInvoiceLink>
          <Link
            to="/documents/invoices"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/80 px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted/40"
          >
            <Search className="h-3.5 w-3.5" />
            All invoices
          </Link>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium text-foreground">Recent</h2>
          {recent.length > 0 ? (
            <Link
              to="/documents/invoices"
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              View all
            </Link>
          ) : null}
        </div>

        {recent.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <ul className="divide-y divide-border/80 border-y border-border/80 md:hidden">
              {recent.map((inv) => {
                const t = computeTotals(inv);
                return (
                  <li key={inv.id}>
                    <Link
                      to="/invoice/$id"
                      params={{ id: inv.id }}
                      className="block py-3 transition-colors hover:bg-muted/20"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{inv.number}</p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {inv.clientName}
                          </p>
                        </div>
                        <p className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                          {formatINR(t.total)}
                        </p>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span className="tabular-nums">{formatDisplayDate(inv.date)}</span>
                        <span className={cn("capitalize", statusTone(inv.status))}>
                          {statusLabel(inv.status)}
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className="hidden overflow-x-auto border-y border-border/80 md:block">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border/80 text-left text-xs text-muted-foreground">
                    <th className="py-3 pr-3 font-medium">Invoice</th>
                    <th className="px-3 py-3 font-medium">Client</th>
                    <th className="px-3 py-3 font-medium">Date</th>
                    <th className="px-3 py-3 text-right font-medium">Amount</th>
                    <th className="py-3 pl-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {recent.map((inv) => {
                    const t = computeTotals(inv);
                    return (
                      <tr key={inv.id} className="transition-colors hover:bg-muted/20">
                        <td className="max-w-[12rem] py-3 pr-3">
                          <Link
                            to="/invoice/$id"
                            params={{ id: inv.id }}
                            className="block truncate font-medium text-foreground hover:underline"
                            title={inv.number}
                          >
                            {inv.number}
                          </Link>
                        </td>
                        <td
                          className="max-w-[12rem] truncate px-3 py-3 text-muted-foreground"
                          title={inv.clientName}
                        >
                          {inv.clientName}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 tabular-nums text-muted-foreground">
                          {formatDisplayDate(inv.date)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums text-foreground">
                          {formatINR(t.total)}
                        </td>
                        <td className={cn("py-3 pl-3 capitalize", statusTone(inv.status))}>
                          {statusLabel(inv.status)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="border-y border-dashed border-border/80 py-12 text-center">
      <p className="text-sm font-medium text-foreground">No invoices yet</p>
      <p className="mt-1 text-xs text-muted-foreground">Create one to see it listed here.</p>
      <NewInvoiceLink className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
        <Plus className="h-3.5 w-3.5" />
        Create invoice
      </NewInvoiceLink>
    </div>
  );
}
