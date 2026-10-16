import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { SearchWithPeriodFilter } from "@/components/operations/SearchWithPeriodFilter";
import { loadCompany, loadInvoices } from "@/lib/storage";
import { computeTotals, formatINR, deriveInvoiceStatus } from "@/lib/invoice-calc";
import { isWithinPeriod, DEFAULT_PERIOD, type PeriodKey } from "@/lib/date-range-filter";
import { downloadInvoicePdf } from "@/lib/pdf";
import type { Invoice } from "@/lib/types";
import { statusBadgeClassDark, statusIndicatorEmoji } from "@/lib/invoice-status";
import { logClientError } from "@/lib/client-logger";
import { useOperations } from "@/hooks/use-operations";

export function InvoicesLedger({
  emptyMessage = "No invoices match your search.",
}: {
  emptyMessage?: string;
}) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState<PeriodKey>(DEFAULT_PERIOD);
  const [status, setStatus] = useState<"all" | Invoice["status"]>("all");
  const { ops } = useOperations();
  const payments = useMemo(() => ops.payments ?? [], [ops.payments]);

  const refresh = () =>
    void loadInvoices()
      .then(setInvoices)
      .catch((e) => logClientError("invoicesLedger.load", e));

  useEffect(() => {
    refresh();
  }, []);

  const derivedInvoices = useMemo(() => {
    return invoices.map((inv) => ({
      ...inv,
      status: deriveInvoiceStatus(inv, payments),
    }));
  }, [invoices, payments]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return derivedInvoices.filter((inv) => {
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
  }, [derivedInvoices, q, period, status]);

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
          className="w-full shrink-0 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-semibold text-white focus:border-[#ff6b2b]/50 focus:outline-none focus:ring-1 focus:ring-[#ff6b2b]/50 sm:w-auto"
        >
          <option value="all" className="bg-[#16161c]">All statuses</option>
          <option value="draft" className="bg-[#16161c]">Draft</option>
          <option value="generated" className="bg-[#16161c]">Generated</option>
          <option value="sent" className="bg-[#16161c]">Sent</option>
          <option value="viewed" className="bg-[#16161c]">Viewed</option>
          <option value="partially_paid" className="bg-[#16161c]">Partially Paid</option>
          <option value="paid" className="bg-[#16161c]">Paid</option>
          <option value="cancelled" className="bg-[#16161c]">Cancelled</option>
          <option value="overdue" className="bg-[#16161c]">Overdue</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 glass-panel shadow-xl">
        {filtered.length === 0 ? (
          <div className="p-16 text-center text-sm text-white/40">{emptyMessage}</div>
        ) : (
          <>
            <ul className="divide-y divide-white/5 md:hidden" aria-label="Invoice list">
              {filtered.map((inv) => {
                const t = computeTotals(inv);
                return (
                  <li key={inv.id} className="p-4 hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <Link
                          to="/invoice/$id"
                          params={{ id: inv.id }}
                          className="block truncate text-base font-bold text-white hover:text-[#ff6b2b] transition-colors"
                          title={inv.number}
                        >
                          {inv.number}
                        </Link>
                        <p className="mt-0.5 line-clamp-1 text-xs text-white/50">
                          {inv.clientName}
                        </p>
                      </div>
                      <StatusBadge status={inv.status} />
                    </div>
                    <dl className="mt-3 grid gap-2 text-xs">
                      <div className="flex justify-between gap-3">
                        <dt className="text-white/40">Date</dt>
                        <dd className="font-mono text-white/80">{inv.date}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-white/40">Total</dt>
                        <dd className="tabular-nums font-semibold text-white">{formatINR(t.total)}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="font-semibold text-white/70">Payable</dt>
                        <dd className="font-bold tabular-nums text-white">
                          {formatINR(t.payable)}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-3 flex justify-end gap-1 border-t border-white/5 pt-2.5">
                      <IconButton title="Download PDF" onClick={() => handleDownload(inv)}>
                        <Download className="h-4 w-4" />
                      </IconButton>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <thead className="border-b border-white/10 bg-white/[0.02] text-left text-[11px] font-bold uppercase tracking-wider text-white/50">
                  <tr>
                    <th className="px-5 py-3.5">Invoice #</th>
                    <th className="px-5 py-3.5">Client</th>
                    <th className="px-5 py-3.5">Date</th>
                    <th className="px-5 py-3.5 text-right">Total</th>
                    <th className="px-5 py-3.5 text-right">Payable</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filtered.map((inv) => {
                    const t = computeTotals(inv);
                    return (
                      <tr
                        key={inv.id}
                        className="transition-colors hover:bg-white/[0.03]"
                      >
                        <td className="max-w-[11rem] px-5 py-4">
                          <Link
                            to="/invoice/$id"
                            params={{ id: inv.id }}
                            className="block truncate font-bold text-white hover:text-[#ff6b2b] transition-colors"
                            title={inv.number}
                          >
                            {inv.number}
                          </Link>
                        </td>
                        <td className="max-w-[10rem] truncate px-5 py-4 text-white/80" title={inv.clientName}>
                          {inv.clientName}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 font-mono text-xs text-white/50">
                          {inv.date}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-right tabular-nums text-white/70">
                          {formatINR(t.total)}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-right font-bold tabular-nums text-white">
                          {formatINR(t.payable)}
                        </td>
                        <td className="px-5 py-4">
                          <StatusBadge status={inv.status} />
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="inline-flex gap-1">
                            <IconButton title="Download PDF" onClick={() => handleDownload(inv)}>
                              <Download className="h-4 w-4" />
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
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider " +
        statusBadgeClassDark(status)
      }
    >
      <span className="select-none text-xs leading-none" aria-hidden>
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
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 glass-card text-white/60 transition-colors hover:border-white/20 hover:text-white"
    >
      {children}
    </button>
  );
}
