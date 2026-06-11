import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Briefcase,
  ChevronRight,
  IndianRupee,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { DEFAULT_PUBLIC_LOGO_URL } from "@/lib/constants";
import { logClientError } from "@/lib/client-logger";
import { computeTotals, formatINRWhole } from "@/lib/invoice-calc";
import { loadInvoices } from "@/lib/storage";
import { useOperations } from "@/hooks/use-operations";
import {
  sumAllProjectIncome,
  sumOngoingProjectRevenue,
} from "@/lib/analytics";
import type { Invoice } from "@/lib/types";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/")({ component: OperationsDashboard });

function OperationsDashboard() {
  const { ops, loading: opsLoading } = useOperations();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);

  useEffect(() => {
    void loadInvoices()
      .then(setInvoices)
      .catch((e) => {
        logClientError("operationsDashboard.loadInvoices", e);
        setInvoices([]);
      })
      .finally(() => setInvoicesLoading(false));
  }, []);

  const loading = opsLoading || invoicesLoading;

  const totalIncome = sumAllProjectIncome(ops.projects);
  const totalRevenue = sumOngoingProjectRevenue(ops.projects);
  const totalExpenses = ops.expenses.reduce((s, e) => s + e.amount, 0);
  const netBalance = totalIncome - totalExpenses;
  const invoiceIncome = useMemo(
    () => invoices.reduce((s, i) => s + computeTotals(i).total, 0),
    [invoices],
  );
  const activeProjects = ops.projects.filter((p) => p.status === "active").length;
  const activePartnerships = ops.partnerships.filter((p) => p.status === "active").length;

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Loading dashboard…
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="border-l-4 border-primary">
          <div className="relative overflow-hidden rounded-r-lg p-5 sm:p-8">
            <div
              className="pointer-events-none absolute inset-0 bg-[length:min(42%,220px)_auto] bg-[position:right_-4%_center] bg-no-repeat opacity-[0.12]"
              style={{ backgroundImage: `url(${DEFAULT_PUBLIC_LOGO_URL})` }}
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/45 from-0% via-primary/18 via-45% to-primary/8 to-100%"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background from-0% via-background/94 via-[55%] to-transparent to-[85%]"
              aria-hidden
            />
            <div className="relative z-10">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                Admark Digitals
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground md:text-3xl md:leading-snug">
                Operations dashboard
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/90 md:text-[15px]">
                Your overview of income, revenue pipeline, and expenses. Click any stat for details
                or open Analytics for month-wise charts.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          to="/analytics/income"
          icon={<TrendingUp className="h-5 w-5" />}
          label="Total income"
          value={formatINRWhole(totalIncome)}
          tone="positive"
        />
        <StatCard
          to="/analytics/revenue"
          icon={<IndianRupee className="h-5 w-5" />}
          label="Total revenue"
          value={formatINRWhole(totalRevenue)}
          tone="positive"
        />
        <StatCard
          to="/analytics/expenses"
          icon={<Wallet className="h-5 w-5" />}
          label="Total expenses"
          value={formatINRWhole(totalExpenses)}
          tone="negative"
        />
        <StatCard
          to="/analytics/balance"
          icon={
            netBalance >= 0 ? (
              <ArrowUpRight className="h-5 w-5" />
            ) : (
              <ArrowDownRight className="h-5 w-5" />
            )
          }
          label="Net balance"
          value={formatINRWhole(netBalance)}
          tone={netBalance >= 0 ? "positive" : "negative"}
        />
        <StatCard
          to="/analytics/ongoing"
          icon={<Briefcase className="h-5 w-5" />}
          label="Ongoing"
          value={String(activeProjects)}
          tone="positive"
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <QuickLink
          to="/analytics"
          icon={<BarChart3 className="h-5 w-5 text-primary" strokeWidth={2} />}
          title="Analytics"
          description="Month-wise income vs expenses and drill-downs"
        />
        <QuickLink
          to="/projects"
          icon={<Briefcase className="h-5 w-5 text-primary" strokeWidth={2} />}
          title="Projects"
          description={`${ops.projects.length} logged · ${activeProjects} ongoing`}
        />
        <QuickLink
          to="/partnerships"
          icon={<ChevronRight className="h-5 w-5 text-primary" strokeWidth={2} />}
          title="Partnerships"
          description={`${ops.partnerships.length} logged · ${activePartnerships} active`}
        />
        <QuickLink
          to="/expenses"
          icon={<Wallet className="h-5 w-5 text-primary" strokeWidth={2} />}
          title="Expenses"
          description={`${ops.expenses.length} entries · ${formatINRWhole(totalExpenses)} total`}
        />
      </section>

      <section className="rounded-lg border border-dashed border-border bg-muted/10 p-5 text-center sm:p-6">
        <p className="text-sm text-muted-foreground">
          <Link to="/invoices" className="font-medium text-primary hover:underline">
            {invoices.length} invoices
          </Link>
          {" · "}
          {formatINRWhole(invoiceIncome)} billed ·{" "}
          <Link to="/analytics" className="font-medium text-primary hover:underline">
            Open analytics
          </Link>{" "}
          for monthly charts
        </p>
      </section>
    </div>
  );
}

function QuickLink({
  to,
  icon,
  title,
  description,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <div>
        {icon}
        <h3 className="mt-3 text-lg font-semibold tracking-tight">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  );
}

function StatCard({
  to,
  icon,
  label,
  value,
  tone,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-400"
      : tone === "negative"
        ? "text-rose-400"
        : "text-primary/75";
  return (
    <Link
      to={to}
      className="group block rounded-lg border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span className={`shrink-0 [&_svg]:opacity-95 ${toneClass}`}>{icon}</span>
      </div>
      <p className="mt-3 text-xl font-semibold tracking-tight text-foreground tabular-nums sm:text-2xl">
        {value}
      </p>
      <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
        View details
        <ChevronRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}
