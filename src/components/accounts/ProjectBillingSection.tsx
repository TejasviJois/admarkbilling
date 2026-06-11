import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { AccountsMetricCard } from "@/components/accounts/AccountsMetricCard";
import {
  ActiveMrrBreakdownList,
  BookedRevenueBreakdownList,
  FutureMonthlyBreakdownList,
} from "@/components/accounts/billing-breakdown-panels";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatFinancialINR, type FinancialSummary } from "@/lib/financial";
import { formatINRWhole } from "@/lib/invoice-calc";
import {
  activeMrrBreakdown,
  bookedRevenueBreakdown,
  futureMonthlyBreakdown,
} from "@/lib/project-billing";
import type { OperationsData } from "@/lib/types";

export type BillingBreakdown = "booked" | "future" | "mrr";

export function ProjectBillingSection({
  ops,
  financial,
  projectPayments,
  activeMrr,
  futureMonthly,
  onOpenIncome,
}: {
  ops: OperationsData;
  financial: FinancialSummary;
  projectPayments: number;
  activeMrr: number;
  futureMonthly: number;
  onOpenIncome: () => void;
}) {
  const [breakdownDialog, setBreakdownDialog] = useState<BillingBreakdown | null>(null);

  const bookedRows = useMemo(() => bookedRevenueBreakdown(ops.projects), [ops.projects]);
  const futureRows = useMemo(() => futureMonthlyBreakdown(ops.projects), [ops.projects]);
  const mrrRows = useMemo(() => activeMrrBreakdown(ops.projects), [ops.projects]);

  return (
    <>
      <section id="billing" className="scroll-mt-24 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <AccountsMetricCard
            label="Revenue booked"
            value={formatFinancialINR(financial.totalRevenueBooked)}
            tone="positive"
            hint="Ongoing & done only"
            selected={breakdownDialog === "booked"}
            onClick={() => setBreakdownDialog("booked")}
          />
          <AccountsMetricCard
            label="FMRR"
            value={formatFinancialINR(futureMonthly)}
            tone="neutral"
            hint="Retainers without a start date"
            selected={breakdownDialog === "future"}
            onClick={() => setBreakdownDialog("future")}
          />
          <AccountsMetricCard
            label="Active MRR"
            value={formatFinancialINR(activeMrr)}
            tone="positive"
            hint="Started retainers"
            selected={breakdownDialog === "mrr"}
            onClick={() => setBreakdownDialog("mrr")}
          />
          <AccountsMetricCard
            label="Payments logged"
            value={formatFinancialINR(projectPayments)}
            tone="neutral"
            hint="All installments in system"
            onClick={onOpenIncome}
          />
        </div>

        <Link
          to="/accounts/billing"
          className="group flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3 shadow-sm transition-colors hover:border-sky-500/40 hover:bg-muted/20"
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Billing details</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Full project list — search, review, and edit billing per client
            </p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </Link>
      </section>

      <Dialog open={breakdownDialog === "booked"} onOpenChange={(open) => !open && setBreakdownDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Revenue booked — breakdown</DialogTitle>
            <DialogDescription>
              Contract value counted from ongoing and done projects (upfront + fixed monthly that has
              started). Separate from payments logged.
            </DialogDescription>
          </DialogHeader>
          <BookedRevenueBreakdownList rows={bookedRows} />
          <p className="border-t border-border pt-3 text-sm font-semibold tabular-nums">
            Total: {formatINRWhole(financial.totalRevenueBooked)}
          </p>
        </DialogContent>
      </Dialog>

      <Dialog open={breakdownDialog === "future"} onOpenChange={(open) => !open && setBreakdownDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>FMRR — breakdown</DialogTitle>
            <DialogDescription>
              Unstarted monthly billing only. Fixed-term projects show rate × number of months; ongoing
              retainers show per-month amount. Upfront amounts are not included here.
            </DialogDescription>
          </DialogHeader>
          <FutureMonthlyBreakdownList rows={futureRows} />
          <p className="border-t border-border pt-3 text-sm font-semibold tabular-nums">
            Total: {formatINRWhole(futureMonthly)}
          </p>
        </DialogContent>
      </Dialog>

      <Dialog open={breakdownDialog === "mrr"} onOpenChange={(open) => !open && setBreakdownDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Active MRR — breakdown</DialogTitle>
            <DialogDescription>
              Started open-ended retainers on ongoing and done projects — monthly amount currently
              billing.
            </DialogDescription>
          </DialogHeader>
          <ActiveMrrBreakdownList rows={mrrRows} />
          <p className="border-t border-border pt-3 text-sm font-semibold tabular-nums">
            Total: {formatINRWhole(activeMrr)}/month
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
