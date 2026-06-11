import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { SearchWithPeriodFilter } from "@/components/operations/SearchWithPeriodFilter";
import { deleteInvoice, loadCompany, loadInvoices } from "@/lib/storage";
import { computeTotals, formatINR } from "@/lib/invoice-calc";
import { isWithinPeriod, DEFAULT_PERIOD, type PeriodKey } from "@/lib/date-range-filter";
import { downloadInvoicePdf } from "@/lib/pdf";
import type { Invoice } from "@/lib/types";
import { statusBadgeClassDark, statusIndicatorEmoji } from "@/lib/invoice-status";
import { logClientError } from "@/lib/client-logger";

export function InvoicesLedger({
  emptyMessage = "No invoices match your search.",
}: {
  emptyMessage?: string;
}) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState<PeriodKey>(DEFAULT_PERIOD);
  const [status, setStatus] = useState<"all" | Invoice["status"]>("all");

  const refresh = () =>
    void loadInvoices()
      .then(setInvoices)
      .catch((e) => logClientError("invoicesLedger.load", e));

  useEffect(() => {
    refresh();
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (status !== "all" && inv.status !== status) return false;
      if (!isWithinPeriod(inv.date, period)) return false;
      if (!term) return true;
      return (
        inv.number.toLowerCase().includes(term) ||
        inv.clientName.toLowerCase().includes(term) ||
        (inv.clientBusinessType?.toLowerCase().includes(term) ?? false) ||
        inv.items.some((i) => i.description.toLowerCase().includes(term))
      );
    });
  }, [invoices, q, period, status]);

  const handleDelete = (id: string) => {
    if (!confirm("Delete this invoice? This cannot be undone.")) return;
    void deleteInvoice(id)
      .then(refresh)
      .catch((e) => logClientError("invoicesLedger.delete", e));
  };

  const handleDownload = (inv: Invoice) => {
    void loadCompany()
      .then((company) => downloadInvoicePdf(inv, company))
      .catch((e) => logClientError("invoicesLedger.downloadPdf", e));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchWithPeriodFilter
          search={q}
          onSearchChange={setQ}
          period={period}
          onPeriodChange={setPeriod}
          placeholder="Search invoices…"
          className="min-w-0 flex-1 sm:min-w-64"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="w-full shrink-0 rounded-md border border-input bg-card px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary sm:w-auto"
        >
          <option value="all">All statuses</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="partial">Partial</option>
          <option value="overdue">Overdue</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">{emptyMessage}</div>
        ) : (
          <>
            <ul className="divide-y divide-border md:hidden" aria-label="Invoice list">
              {filtered.map((inv) => {
                const t = computeTotals(inv);
                return (
                  <li key={inv.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <Link
                          to="/invoice/$id"
                          params={{ id: inv.id }}
                          className="block truncate text-base font-semibold text-foreground underline-offset-2 hover:text-primary hover:underline"
                          title={inv.number}
                        >
                          {inv.number}
                        </Link>
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{inv.clientName}</p>
                      </div>
                      <StatusBadge status={inv.status} />
                    </div>
                    <dl className="mt-3 grid gap-2 text-sm">
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Date</dt>
                        <dd className="tabular-nums text-foreground">{inv.date}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Total</dt>
                        <dd className="tabular-nums text-foreground">{formatINR(t.total)}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="font-medium text-foreground">Payable</dt>
                        <dd className="font-semibold tabular-nums text-foreground">{formatINR(t.payable)}</dd>
                      </div>
                    </dl>
                    <div className="mt-4 flex justify-end gap-1 border-t border-border pt-3">
                      <IconButton title="Download PDF" onClick={() => handleDownload(inv)}>
                        <Download className="h-4 w-4" />
                      </IconButton>
                      <IconButton
                        title="Delete"
                        onClick={() => handleDelete(inv.id)}
                        destructive
                      >
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/80 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-normal">Invoice #</th>
                    <th className="px-4 py-3 font-normal">Client</th>
                    <th className="px-4 py-3 font-normal">Date</th>
                    <th className="px-4 py-3 text-right font-normal">Total</th>
                    <th className="px-4 py-3 text-right font-normal">Payable</th>
                    <th className="px-4 py-3 font-normal">Status</th>
                    <th className="px-4 py-3 text-right font-normal">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((inv) => {
                    const t = computeTotals(inv);
                    return (
                      <tr key={inv.id} className="border-t border-border transition-colors hover:bg-muted/40">
                        <td className="max-w-[11rem] px-4 py-3">
                          <Link
                            to="/invoice/$id"
                            params={{ id: inv.id }}
                            className="block truncate font-semibold text-foreground hover:text-primary"
                            title={inv.number}
                          >
                            {inv.number}
                          </Link>
                        </td>
                        <td className="max-w-[10rem] truncate px-4 py-3" title={inv.clientName}>
                          {inv.clientName}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{inv.date}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatINR(t.total)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums">
                          {formatINR(t.payable)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={inv.status} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex gap-1">
                            <IconButton title="Download PDF" onClick={() => handleDownload(inv)}>
                              <Download className="h-4 w-4" />
                            </IconButton>
                            <IconButton title="Delete" onClick={() => handleDelete(inv.id)} destructive>
                              <Trash2 className="h-4 w-4" />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Invoice["status"] }) {
  return (
    <span
      className={
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide " +
        statusBadgeClassDark(status)
      }
    >
      <span className="select-none text-sm leading-none" aria-hidden>
        {statusIndicatorEmoji(status)}
      </span>
      {status.toUpperCase()}
    </span>
  );
}

function IconButton({
  title,
  onClick,
  children,
  destructive,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={
        destructive
          ? "inline-flex h-10 w-10 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive md:h-9 md:w-9 md:border-0"
          : "inline-flex h-10 w-10 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-secondary hover:text-foreground md:h-9 md:w-9 md:border-0 md:hover:bg-secondary"
      }
    >
      {children}
    </button>
  );
}
