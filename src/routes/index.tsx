import { createFileRoute, Link } from "@tanstack/react-router";

import { useMemo, useState, useEffect } from "react";

import {

  ArrowDownRight,

  ArrowUpRight,

  BarChart3,

  Briefcase,

  ChevronRight,
  Handshake,
  IndianRupee,

  TrendingUp,

  Wallet,

} from "lucide-react";

import { DEFAULT_PUBLIC_LOGO_URL } from "@/lib/constants";

import { computeTotals, formatINRWhole } from "@/lib/invoice-calc";

import { useOperations } from "@/hooks/use-operations";
import { useInvoices } from "@/hooks/use-invoices";

import { AnalyticsPeriodFilter } from "@/components/analytics/analytics-ui";
import {
  periodMoneyOutTotal,
  periodTotalIncome,
} from "@/lib/analytics";
import { DEFAULT_PERIOD, periodLabel, type PeriodKey } from "@/lib/date-range-filter";
import { computeFinancialSummary, formatFinancialINR } from "@/lib/financial";

export const Route = createFileRoute("/")({ component: OperationsDashboard });



function OperationsDashboard() {
  const { ops, loading: opsLoading } = useOperations();
  const { invoices, loading: invoicesLoading } = useInvoices();
  const [period, setPeriod] = useState<PeriodKey>(DEFAULT_PERIOD);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loading = opsLoading || invoicesLoading;

  const financial = useMemo(() => computeFinancialSummary(ops), [ops]);
  const periodIncome = useMemo(
    () => periodTotalIncome(ops, period),
    [ops, period],
  );
  const periodExpenses = useMemo(
    () => periodMoneyOutTotal(ops, period),
    [ops, period],
  );
  const periodHint = period === "all" ? "All time" : `Last ${periodLabel(period)}`;

  const invoiceIncome = useMemo(
    () => invoices.reduce((s, i) => s + computeTotals(i).total, 0),
    [invoices],
  );

  const activeProjects = ops.projects.filter((p) => p.status === "active").length;
  const activePartnerships = ops.partnerships.filter((p) => p.status === "active").length;

  if (!mounted || loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Loading dashboard…
      </div>
    );
  }



  return (

    <div className="space-y-8">

      <section className="rounded-lg border border-border bg-card shadow-sm">
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

            <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">

              <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">

                Admark Digitals

              </p>

              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground md:text-3xl md:leading-snug">

                Operations dashboard

              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/90 md:text-[15px]">

                Your overview of cash, expenses, and project billing. Monthly retainers only count
                in revenue after their start date is set.

              </p>

              </div>

              <AnalyticsPeriodFilter period={period} onPeriodChange={setPeriod} />

            </div>

          </div>

        </div>

      </section>



      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">

        <StatCard

          to="/analytics/income"

          icon={<TrendingUp className="h-5 w-5" />}

          label="Total income"

          value={formatINRWhole(periodIncome)}

          hint={periodHint}

          tone="positive"

        />

        <StatCard

          to="/accounts/billing"

          icon={<IndianRupee className="h-5 w-5" />}

          label="Revenue booked"

          value={formatFinancialINR(financial.totalRevenueBooked)}

          tone="positive"

        />

        <StatCard

          to="/accounts"

          icon={<Wallet className="h-5 w-5" />}

          label="Total expenses"

          value={formatFinancialINR(periodExpenses)}

          hint={periodHint}

          tone="negative"

        />

        <StatCard

          to="/accounts"

          icon={

            financial.currentCashBalance >= 0 ? (

              <ArrowUpRight className="h-5 w-5" />

            ) : (

              <ArrowDownRight className="h-5 w-5" />

            )

          }

          label="Cash balance"

          value={formatFinancialINR(financial.currentCashBalance)}

          hint="All-time position"

          tone={financial.currentCashBalance >= 0 ? "positive" : "negative"}

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

          description="Category breakdown of money in and out"

        />

        <QuickLink

          to="/projects"

          icon={<Briefcase className="h-5 w-5 text-primary" strokeWidth={2} />}

          title="Projects"

          description={`${ops.projects.length} logged · ${activeProjects} ongoing`}

        />

        <QuickLink

          to="/partnerships"

          icon={<Handshake className="h-5 w-5 text-primary" strokeWidth={2} />}

          title="Partnerships"

          description={`${ops.partnerships.length} logged · ${activePartnerships} active`}

        />

        <QuickLink

          to="/accounts"

          icon={<Wallet className="h-5 w-5 text-primary" strokeWidth={2} />}

          title="Accounts"

          description={`${formatINRWhole(periodIncome)} income · ${formatFinancialINR(periodExpenses)} expenses · ${periodHint}`}

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

  hash,

  icon,

  label,

  value,

  hint,

  tone,

}: {

  to: string;

  hash?: string;

  icon: React.ReactNode;

  label: string;

  value: string;

  hint?: string;

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

      hash={hash}

      className="group block rounded-lg border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"

    >

      <div className="flex items-start justify-between gap-3">

        <span className="text-sm font-medium text-muted-foreground">{label}</span>

        <span className={`shrink-0 [&_svg]:opacity-95 ${toneClass}`}>{icon}</span>

      </div>

      <p className="mt-3 text-xl font-semibold tracking-tight text-foreground tabular-nums sm:text-2xl">

        {value}

      </p>

      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}

      <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">

        View details

        <ChevronRight className="h-3.5 w-3.5" />

      </span>

    </Link>

  );

}


