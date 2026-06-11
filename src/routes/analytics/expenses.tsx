import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Eye } from "lucide-react";
import {
  AnalyticsPageHeader,
  AnalyticsSearch,
  AnalyticsSummaryCards,
  AnalyticsTableSection,
} from "@/components/analytics/analytics-ui";
import { FinancialSummaryPanel } from "@/components/operations/FinancialSummaryPanel";
import {
  ProofImageDialog,
  ProofImageDialogCloseButton,
} from "@/components/operations/ProofImageDialog";
import { OperationsLoading } from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";
import {
  EXPENSE_CATEGORY_DESCRIPTIONS,
  EXPENSE_CATEGORY_LABELS,
  computeFinancialSummary,
  expenseCategoryLabel,
  formatFinancialINR,
} from "@/lib/financial";
import type { ExpenseEntry } from "@/lib/types";

export const Route = createFileRoute("/analytics/expenses")({ component: AnalyticsExpensesPage });

function AnalyticsExpensesPage() {
  const { ops, loading } = useOperations();
  const [search, setSearch] = useState("");
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const [viewerTitle, setViewerTitle] = useState("Expense proof");

  const financial = computeFinancialSummary(ops);
  const loggedExpenses = ops.expenses.filter((e) => !e.isBaseline);
  const sorted = useMemo(
    () => [...loggedExpenses].sort((a, b) => b.date.localeCompare(a.date)),
    [loggedExpenses],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (e) =>
        e.label.toLowerCase().includes(q) ||
        expenseCategoryLabel(e.category).toLowerCase().includes(q) ||
        e.date.includes(q) ||
        String(e.amount).includes(q),
    );
  }, [sorted, search]);

  const openProof = (expense: ExpenseEntry) => {
    if (!expense.proof?.imageDataUrl) return;
    setViewerTitle(`${expense.label} — ${formatFinancialINR(expense.amount)}`);
    setViewerSrc(expense.proof.imageDataUrl);
    setViewerOpen(true);
  };

  if (loading) return <OperationsLoading />;

  return (
    <div className="space-y-8">
      <AnalyticsPageHeader
        title="Total expenses"
        description="Historical baseline (no proof) plus new entries logged from the Expenses page."
      />
      <AnalyticsSummaryCards
        items={[
          { label: "Total money out", value: formatFinancialINR(financial.totalExpense), tone: "negative" },
          {
            label: EXPENSE_CATEGORY_LABELS.company,
            value: formatFinancialINR(financial.totalCompanyExpenses),
            tone: "negative",
          },
          {
            label: EXPENSE_CATEGORY_LABELS.founder_payout,
            value: formatFinancialINR(financial.founderPayoutPool),
            tone: "negative",
          },
          {
            label: EXPENSE_CATEGORY_LABELS.external_payout,
            value: formatFinancialINR(financial.totalExternalPayouts),
            tone: "negative",
          },
        ]}
      />
      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        {(["company", "founder_payout", "external_payout"] as const).map((key) => (
          <div key={key} className="rounded-lg border border-border bg-muted/20 p-4">
            <p className="text-sm font-semibold text-foreground">{EXPENSE_CATEGORY_LABELS[key]}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {EXPENSE_CATEGORY_DESCRIPTIONS[key]}
            </p>
          </div>
        ))}
      </div>
      <FinancialSummaryPanel summary={financial} compact />
      <AnalyticsTableSection
        title="New expense ledger"
        description="Only entries logged after the historical baseline — each requires proof."
        search={
          <AnalyticsSearch
            value={search}
            onChange={setSearch}
            placeholder="Search description, category, date…"
          />
        }
        headers={["Date", "Description", "Category", "Amount", "Proof"]}
        rows={filtered.map((e) => [
          e.date,
          e.label,
          expenseCategoryLabel(e.category),
          <span key={e.id} className="font-medium tabular-nums text-rose-400">
            {formatFinancialINR(e.amount)}
          </span>,
          e.proof ? (
            <button
              key={`proof-${e.id}`}
              type="button"
              onClick={() => openProof(e)}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <Eye className="h-3.5 w-3.5" />
              View
            </button>
          ) : (
            "—"
          ),
        ])}
        emptyMessage={
          search
            ? "No expenses match your search."
            : "No new expenses logged yet. Historical totals are in the summary above."
        }
      />
      <ProofImageDialog
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        src={viewerSrc}
        title={viewerTitle}
        description="Uploaded proof for this expense."
        footer={<ProofImageDialogCloseButton onClose={() => setViewerOpen(false)} />}
      />
    </div>
  );
}
