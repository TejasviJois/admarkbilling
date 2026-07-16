import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, Wallet } from "lucide-react";
import { ProjectBillingSection } from "@/components/accounts/ProjectBillingSection";
import { Button } from "@/components/ui/button";
import { AssetsSection } from "@/components/operations/AssetsSection";
import { ExpenseFormDialog } from "@/components/operations/ExpenseFormDialog";
import { ExpensesSection } from "@/components/operations/ExpensesSection";
import { ExpensesPipelineSummary } from "@/components/operations/ExpensesTable";
import { FixedMonthlyExpensesSection } from "@/components/operations/FixedMonthlyExpensesSection";
import { IncomeSection } from "@/components/operations/IncomeSection";
import { DataSection, OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";
import {
  sumActiveMrr,
  sumAllProjectIncome,
  sumFutureMonthlyPipeline,
} from "@/lib/analytics";
import { sumAssets } from "@/lib/assets";
import { computeFinancialSummary, formatFinancialINR } from "@/lib/financial";
import { formatINRWhole } from "@/lib/invoice-calc";
import type { ExpenseEntry, Transaction } from "@/lib/types";

type AccountsPanel =
  | "income"
  | "expenses"
  | "ledger"
  | "assets";

type ExpandedPanels = Record<AccountsPanel, boolean>;

const CLOSED_PANELS: ExpandedPanels = {
  income: false,
  expenses: false,
  ledger: false,
  assets: false,
};

export const Route = createFileRoute("/accounts/")({ component: AccountsPage });

function AccountsPage() {
  const navigate = useNavigate();
  const { ops, persist, loading } = useOperations();
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expanded, setExpanded] = useState<ExpandedPanels>(CLOSED_PANELS);

  const financial = computeFinancialSummary(ops);
  const totalIncome = sumAllProjectIncome(ops.projects);
  const totalAssets = sumAssets(ops.assets);
  const activeMrr = sumActiveMrr(ops.projects);
  const futureMonthly = sumFutureMonthlyPipeline(ops.projects);

  const handleSaveExpense = (tx: Transaction) => {
    persist({ ...ops, transactions: [tx, ...(ops.transactions ?? [])] });
  };

  const setPanel = (panel: AccountsPanel, open: boolean) => {
    setExpanded((prev) => ({ ...prev, [panel]: open }));
  };

  const openPanel = (panel: AccountsPanel) => {
    setPanel(panel, true);
    if (panel === "ledger") {
      setPanel("expenses", true);
    }
    requestAnimationFrame(() => {
      const id = panel === "ledger" ? "expenses" : panel;
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const openMonthlyRetainers = () => {
    setPanel("expenses", true);
    requestAnimationFrame(() => {
      document.getElementById("monthly-retainers")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  useEffect(() => {
    const syncHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash === "billing-details") {
        void navigate({ to: "/accounts/billing" });
        return;
      }
      if (hash === "billing") {
        document.getElementById("billing")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      if (hash === "monthly-retainers") {
        openMonthlyRetainers();
        return;
      }
      const panel = hash as AccountsPanel;
      if (panel === "income" || panel === "expenses" || panel === "assets") {
        openPanel(panel);
      }
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, [navigate]);

  if (loading) return <OperationsLoading />;

  return (
    <div>
      <OperationsPageHeader
        title="Accounts"
        description="Project billing, income, expenses, and assets — expand each section as needed."
      />

      <div className="mb-8 space-y-6">
        <ProjectBillingSection
          ops={ops}
          financial={financial}
          projectPayments={totalIncome}
          activeMrr={activeMrr}
          futureMonthly={futureMonthly}
          onOpenIncome={() => openPanel("income")}
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryCard
            label="Income"
            value={formatINRWhole(totalIncome)}
            valueClass="text-emerald-300"
            hoverClass="hover:border-emerald-500/40"
            onClick={() => openPanel("income")}
          />
          <SummaryCard
            label="Expenses"
            value={formatFinancialINR(financial.totalExpense)}
            valueClass="text-rose-400"
            hoverClass="hover:border-rose-500/40"
            onClick={() => openPanel("expenses")}
          />
          <SummaryCard
            label="Assets"
            value={formatINRWhole(totalAssets)}
            valueClass="text-sky-300"
            hoverClass="hover:border-sky-500/40"
            onClick={() => openPanel("assets")}
          />
        </div>
      </div>

      <div className="space-y-4">
        <IncomeSection
          ops={ops}
          persist={persist}
          open={expanded.income}
          onOpenChange={(open) => setPanel("income", open)}
        />

        <DataSection
          id="expenses"
          collapsible
          open={expanded.expenses}
          onOpenChange={(open) => setPanel("expenses", open)}
          title="Expenses"
          description="Baseline totals, logged payouts, and monthly retainers (salary, EMI, rent)."
          icon={<Wallet className="h-5 w-5 text-rose-400" strokeWidth={2} />}
          action={
            <Button
              type="button"
              size="icon"
              onClick={() => setExpenseOpen(true)}
              aria-label="Log expense"
            >
              <Plus className="h-5 w-5" />
            </Button>
          }
        >
          <ExpenseFormDialog
            open={expenseOpen}
            onOpenChange={setExpenseOpen}
            onSave={handleSaveExpense}
          />

          <ExpensesPipelineSummary ops={ops} onOpenMonthlyRetainers={openMonthlyRetainers} />

          <div className="mt-6 space-y-4">
            <ExpensesSection
              ops={ops}
              persist={persist}
              open={expanded.ledger}
              onOpenChange={(open) => setPanel("ledger", open)}
            />
            <FixedMonthlyExpensesSection ops={ops} persist={persist} />
          </div>
        </DataSection>

        <AssetsSection
          ops={ops}
          persist={persist}
          open={expanded.assets}
          onOpenChange={(open) => setPanel("assets", open)}
        />
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  valueClass,
  hoverClass,
  onClick,
}: {
  label: string;
  value: string;
  valueClass: string;
  hoverClass: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border border-border bg-card px-4 py-3 text-left shadow-sm transition-colors ${hoverClass}`}
    >
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums sm:text-xl ${valueClass}`}>{value}</p>
    </button>
  );
}
