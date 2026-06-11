import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FileText, Plus, Search, Settings as SettingsIcon, TrendingUp, Users } from "lucide-react";
import { loadInvoices, loadCompany, DEFAULT_COMPANY } from "@/lib/storage";
import { logClientError } from "@/lib/client-logger";
import { companyLogoSrc } from "@/lib/company-branding";
import { computeTotals, formatINR } from "@/lib/invoice-calc";
import type { CompanySettings, Invoice } from "@/lib/types";
import { statusBadgeClassDark, statusIndicatorEmoji } from "@/lib/invoice-status";

export const Route = createFileRoute("/invoices")({ component: InvoicesDashboard });

function InvoicesDashboard() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [companySnap, setCompanySnap] = useState<CompanySettings>(DEFAULT_COMPANY);
  useEffect(() => {
    void loadInvoices().then(setInvoices).catch((e) => logClientError("dashboard.loadInvoices", e));
  }, []);
  useEffect(() => {
    void loadCompany().then(setCompanySnap).catch((e) => logClientError("dashboard.loadCompany", e));
  }, []);

  const totalRevenue = invoices.reduce((s, i) => s + computeTotals(i).total, 0);
  const totalCollected =
    invoices.reduce((s, i) => s + computeTotals(i).total - computeTotals(i).payable, 0) +
    invoices.filter((i) => i.status === "paid").reduce((s, i) => s + computeTotals(i).payable, 0);
  const uniqueClients = new Set(invoices.map((i) => i.clientName.trim().toLowerCase())).size;

  const recent = invoices.slice(0, 5);

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="border-l-4 border-primary">
          <div className="relative grid gap-6 overflow-hidden rounded-r-lg p-5 sm:gap-8 sm:p-8 md:grid-cols-[1fr_auto] md:items-end">
            {/* Red wash + left scrim so copy stays readable */}
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/50 from-0% via-primary/22 via-45% to-primary/10 to-100%"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background from-0% via-background/92 via-[52%] to-transparent to-[82%]"
              aria-hidden
            />
            <div className="relative z-10">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground [text-shadow:0_1px_2px_oklch(0_0_0/0.45)] md:text-3xl md:leading-snug">
                Invoice management
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/90 md:text-[15px] [text-shadow:0_1px_2px_oklch(0_0_0/0.4)]">
                Create, track, and send professional invoices with auto-numbering, tax
                calculations, and PDF export. Company details from Settings appear on every
                invoice automatically.
              </p>
            </div>
            <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap md:flex-col lg:flex-row">
              <Link
                to="/new"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md ring-1 ring-white/15 transition-colors hover:bg-primary/90"
              >
                <Plus className="h-4 w-4 shrink-0" strokeWidth={2} /> New invoice
              </Link>
              <Link
                to="/history"
                className="inline-flex items-center justify-center gap-2 rounded-md border border-white/25 bg-background/55 px-5 py-2.5 text-sm font-semibold text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-background/75"
              >
                <Search className="h-4 w-4 shrink-0" strokeWidth={2} /> View history
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<FileText className="h-5 w-5" />}
          label="Invoices"
          value={String(invoices.length)}
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Billed total"
          value={formatINR(totalRevenue)}
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Collected"
          value={formatINR(totalCollected)}
        />
        <StatCard
          icon={<Users className="h-5 w-5" />}
          label="Clients"
          value={String(uniqueClients)}
        />
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Recent invoices</h2>
            <p className="mt-1 text-sm text-muted-foreground">Latest work in this browser.</p>
          </div>
          <Link
            to="/history"
            className="text-sm font-medium text-primary hover:underline underline-offset-4"
          >
            View all
          </Link>
        </div>
        {recent.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <ul className="space-y-3 md:hidden" aria-label="Recent invoices">
              {recent.map((inv) => {
                const t = computeTotals(inv);
                return (
                  <li key={inv.id}>
                    <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Invoice
                          </p>
                          <Link
                            to="/invoice/$id"
                            params={{ id: inv.id }}
                            className="mt-1 block truncate text-base font-semibold text-foreground underline-offset-2 hover:text-primary hover:underline"
                            title={inv.number}
                          >
                            {inv.number}
                          </Link>
                        </div>
                        <StatusBadge status={inv.status} />
                      </div>
                      <dl className="mt-4 grid gap-2 text-sm">
                        <div className="flex justify-between gap-3">
                          <dt className="shrink-0 text-muted-foreground">Client</dt>
                          <dd className="min-w-0 text-right font-medium text-foreground">
                            <span className="line-clamp-2">{inv.clientName}</span>
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">Date</dt>
                          <dd className="tabular-nums text-foreground">{inv.date}</dd>
                        </div>
                        <div className="flex justify-between gap-3 border-t border-border pt-2">
                          <dt className="font-medium text-foreground">Amount</dt>
                          <dd className="font-semibold tabular-nums text-foreground">{formatINR(t.total)}</dd>
                        </div>
                      </dl>
                    </article>
                  </li>
                );
              })}
            </ul>
            <div className="hidden overflow-hidden rounded-lg border border-border bg-card shadow-sm md:block">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/80 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-normal">Invoice #</th>
                    <th className="px-4 py-3 font-normal">Client</th>
                    <th className="px-4 py-3 font-normal">Date</th>
                    <th className="px-4 py-3 text-right font-normal">Amount</th>
                    <th className="px-4 py-3 font-normal">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((inv) => {
                    const t = computeTotals(inv);
                    return (
                      <tr key={inv.id} className="border-t border-border transition-colors hover:bg-muted/40">
                        <td className="max-w-[12rem] px-4 py-3">
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
                        <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-foreground">
                          {formatINR(t.total)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={inv.status} />
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

      <section className="grid gap-4 sm:grid-cols-2">
        <Link
          to="/new"
          className="group rounded-lg border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
        >
          <Plus className="h-5 w-5 text-primary" strokeWidth={2} />
          <h3 className="mt-4 text-lg font-semibold tracking-tight">New invoice</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Auto-numbered for the financial year. PDF when you need it.
          </p>
        </Link>
        <Link
          to="/settings"
          className="group relative overflow-hidden rounded-lg border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
        >
          {/* Watermark logo + brand gradient (stack under content) */}
          <div
            className="pointer-events-none absolute inset-0 bg-[length:min(58%,240px)_auto] bg-[position:right_-8%_center] bg-no-repeat opacity-[0.18] transition-opacity duration-300 group-hover:opacity-[0.26]"
            style={{ backgroundImage: `url(${companyLogoSrc(companySnap)})` }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/50 from-0% via-primary/15 via-45% to-transparent to-100%"
            aria-hidden
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" aria-hidden />
          <div className="relative z-10">
            <SettingsIcon className="h-5 w-5 text-primary" strokeWidth={2} />
            <h3 className="mt-3 text-lg font-semibold tracking-tight">Company settings</h3>
            <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
              {companySnap.address}
            </p>
            {(companySnap.bankName || companySnap.accountNumber) && (
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {companySnap.bankName}
                {companySnap.accountNumber
                  ? ` · A/C ····${companySnap.accountNumber.slice(-4)}`
                  : ""}
              </p>
            )}
          </div>
        </Link>
      </section>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span className="shrink-0 text-primary/75 [&_svg]:opacity-95">{icon}</span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground tabular-nums">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: Invoice["status"] }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${statusBadgeClassDark(status)}`}
    >
      <span className="select-none text-sm leading-none" aria-hidden>
        {statusIndicatorEmoji(status)}
      </span>
      {status.toUpperCase()}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card/60 p-12 text-center shadow-sm">
      <FileText className="mx-auto h-10 w-10 text-muted-foreground/60" strokeWidth={1.5} />
      <p className="mt-4 font-medium text-foreground">No invoices yet</p>
      <p className="mt-1 text-sm text-muted-foreground">Create an invoice to see it listed here.</p>
      <Link
        to="/new"
        className="mt-5 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
      >
        <Plus className="h-4 w-4" strokeWidth={2} /> Create invoice
      </Link>
    </div>
  );
}
