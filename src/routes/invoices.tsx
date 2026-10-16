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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="h-6 w-1.5 shrink-0 rounded-full bg-gradient-to-b from-[#ff6b2b] to-[#f04400] shadow-[0_0_12px_#ff6b2b]" />
            <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
              Invoices
            </h1>
          </div>
          <p className="mt-1.5 max-w-xl text-xs text-white/50 md:text-sm">
            Create, manage, and dispatch verified client billing and GST invoices.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-0.5 text-xs font-bold text-orange-400">
              {invoices.length} {invoices.length === 1 ? "invoice" : "invoices"} total
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <NewInvoiceLink className="inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-r from-[#ff6b2b] to-[#f04400] px-5 text-xs font-bold text-white shadow-lg shadow-orange-500/25 transition-all hover:scale-105 active:scale-95">
            <Plus className="h-4 w-4" />
            New invoice
          </NewInvoiceLink>
          <Link
            to="/documents/invoices"
            className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 text-xs font-semibold text-white backdrop-blur-md transition-colors hover:border-white/20 hover:bg-white/10"
          >
            <Search className="h-3.5 w-3.5 text-white/60" />
            All invoices
          </Link>
        </div>
      </div>

      <section className="rounded-[32px] border border-white/10 bg-[#141419]/85 p-6 shadow-2xl backdrop-blur-3xl sm:p-8">
        <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <span className="h-3 w-1 rounded-full bg-orange-500" />
            <h2 className="text-sm font-bold tracking-tight text-white">Recent Invoices</h2>
          </div>
          {recent.length > 0 ? (
            <Link
              to="/documents/invoices"
              className="text-xs font-semibold text-orange-400 transition-colors hover:underline"
            >
              View all &rarr;
            </Link>
          ) : null}
        </div>

        {recent.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <ul className="divide-y divide-white/5 md:hidden">
              {recent.map((inv) => {
                const t = computeTotals(inv);
                return (
                  <li key={inv.id}>
                    <Link
                      to="/invoice/$id"
                      params={{ id: inv.id }}
                      className="block py-3.5 transition-colors hover:bg-white/[0.03]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-white">{inv.number}</p>
                          <p className="mt-0.5 truncate text-xs text-white/50">
                            {inv.clientName}
                          </p>
                        </div>
                        <p className="shrink-0 text-sm font-bold tabular-nums text-emerald-400">
                          {formatINR(t.total)}
                        </p>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-white/40">
                        <span className="tabular-nums">{formatDisplayDate(inv.date)}</span>
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", statusTone(inv.status))}>
                          {statusLabel(inv.status)}
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-[11px] font-bold uppercase tracking-wider text-white/40">
                    <th className="py-3 pr-4">Invoice</th>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="py-3 pl-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {recent.map((inv) => {
                    const t = computeTotals(inv);
                    return (
                      <tr key={inv.id} className="transition-colors hover:bg-white/[0.03]">
                        <td className="max-w-[12rem] py-3.5 pr-4">
                          <Link
                            to="/invoice/$id"
                            params={{ id: inv.id }}
                            className="block truncate font-bold text-white hover:text-orange-400 hover:underline"
                            title={inv.number}
                          >
                            {inv.number}
                          </Link>
                        </td>
                        <td
                          className="max-w-[12rem] truncate px-4 py-3.5 font-medium text-white/70"
                          title={inv.clientName}
                        >
                          {inv.clientName}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 tabular-nums text-white/50">
                          {formatDisplayDate(inv.date)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-right font-bold tabular-nums text-emerald-400">
                          {formatINR(t.total)}
                        </td>
                        <td className="py-3.5 pl-4">
                          <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider", statusTone(inv.status))}>
                            {statusLabel(inv.status)}
                          </span>
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
    <div className="rounded-2xl border border-dashed border-white/10 py-14 text-center">
      <p className="text-sm font-bold text-white">No invoices yet</p>
      <p className="mt-1 text-xs text-white/50">Create your first invoice to see it listed here.</p>
      <NewInvoiceLink className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#ff6b2b] to-[#f04400] px-5 text-xs font-bold text-white shadow-lg shadow-orange-500/25 transition-transform hover:scale-105">
        <Plus className="h-4 w-4" />
        Create invoice
      </NewInvoiceLink>
    </div>
  );
}
