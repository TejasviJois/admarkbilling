import { Link } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { ProofThumbnail, proofFromFile } from "@/components/documents/proof-ui";
import {
  ProofImageDialog,
  ProofImageDialogCloseButton,
} from "@/components/operations/ProofImageDialog";
import { attachExpenseProof } from "@/lib/attach-proof";
import { formatINR } from "@/lib/invoice-calc";
import {
  buildMoneyOutRows,
  computeFinancialSummary,
  expenseCategoryLabel,
  formatFinancialINR,
  normalizeCategory,
} from "@/lib/financial";
import {
  formatFinancialINR as formatMonthlyINR,
  sumActiveFixedMonthlyExpenses,
  summarizeFixedMonthlyByKind,
} from "@/lib/fixed-monthly-expenses";
import type { ExpenseEntry, OperationsData, Partnership } from "@/lib/types";
import { DataTable, RowDelete } from "./operations-ui";

function loggedExternalPayouts(expenses: ExpenseEntry[]) {
  return expenses.filter(
    (e) => !e.isBaseline && normalizeCategory(e.category) === "external_payout",
  );
}

function externalPayoutDocumentsLink(ops: OperationsData): string {
  const payouts = loggedExternalPayouts(ops.expenses);
  const partnerCount = payouts.filter((e) => e.partnershipId).length;
  const vendorCount = payouts.filter((e) => !e.partnershipId).length;
  if (partnerCount > 0 && vendorCount === 0) return "/documents/payments/partners";
  if (vendorCount > 0 && partnerCount === 0) return "/documents/payments/vendors";
  return "/documents/payments";
}

function externalPayoutDocumentsHint(ops: OperationsData): string | undefined {
  const payouts = loggedExternalPayouts(ops.expenses);
  if (payouts.length === 0) return undefined;
  const partnerCount = payouts.filter((e) => e.partnershipId).length;
  const vendorCount = payouts.filter((e) => !e.partnershipId).length;
  const parts: string[] = [];
  if (partnerCount > 0) parts.push(`${partnerCount} partner`);
  if (vendorCount > 0) parts.push(`${vendorCount} vendor`);
  return `View proofs · ${parts.join(", ")}`;
}

export function ExpensesPipelineSummary({
  ops,
  onOpenMonthlyRetainers,
}: {
  ops: OperationsData;
  onOpenMonthlyRetainers?: () => void;
}) {
  const financial = computeFinancialSummary(ops);
  const rows = buildMoneyOutRows(financial, ops.expenses);
  const monthlyTotal = sumActiveFixedMonthlyExpenses(ops.fixedMonthlyExpenses);
  const monthlyKinds = summarizeFixedMonthlyByKind(ops.fixedMonthlyExpenses);
  const monthlyHint =
    monthlyKinds.length > 0
      ? monthlyKinds.map((k) => k.label).join(", ")
      : monthlyTotal > 0
        ? "Active retainers"
        : undefined;

  const items = [
    ...rows.map((row) => ({
      key: row.category,
      label: row.label,
      value: formatFinancialINR(row.amount),
      hint:
        row.category === "external_payout"
          ? (externalPayoutDocumentsHint(ops) ??
            (row.newEntryCount > 0 ? `${row.newEntryCount} logged` : undefined))
          : row.newEntryCount > 0
            ? `${row.newEntryCount} logged`
            : undefined,
      className: "text-rose-400",
      to: row.category === "external_payout" ? externalPayoutDocumentsLink(ops) : undefined,
      onClick: undefined as (() => void) | undefined,
    })),
    {
      key: "monthly-retainers",
      label: "Monthly retainers",
      value: `${formatMonthlyINR(monthlyTotal)}/mo`,
      hint: monthlyHint ?? "Salary, EMI, rent…",
      className: "text-rose-400",
      to: undefined as string | undefined,
      onClick: onOpenMonthlyRetainers,
    },
    {
      key: "total",
      label: "Total money out",
      value: formatFinancialINR(financial.totalExpense),
      hint: `Baseline through ${financial.baseline.asOfDate}`,
      className: "text-rose-300",
      to: undefined as string | undefined,
      onClick: undefined as (() => void) | undefined,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => {
        const body = (
          <>
            <p className={`text-lg font-semibold tabular-nums sm:text-xl ${item.className}`}>
              {item.value}
            </p>
            <p className="mt-1 text-xs font-medium text-muted-foreground">{item.label}</p>
            {item.hint && (
              <p
                className={`mt-0.5 text-[10px] ${item.to || item.onClick ? "font-medium text-primary" : "text-muted-foreground/80"}`}
              >
                {item.hint}
              </p>
            )}
          </>
        );

        if (item.to) {
          return (
            <Link
              key={item.key}
              to={item.to}
              className="rounded-lg border border-border bg-card px-4 py-3 text-center shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/20"
            >
              {body}
            </Link>
          );
        }

        if (item.onClick) {
          return (
            <button
              key={item.key}
              type="button"
              onClick={item.onClick}
              className="rounded-lg border border-border bg-card px-4 py-3 text-center shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/20"
            >
              {body}
            </button>
          );
        }

        return (
          <div
            key={item.key}
            className="rounded-lg border border-border bg-card px-4 py-3 text-center shadow-sm"
          >
            {body}
          </div>
        );
      })}
    </div>
  );
}

export function ExpensesTable({
  expenses,
  partnerships,
  ops,
  persist,
  onRemove,
}: {
  expenses: ExpenseEntry[];
  partnerships: Partnership[];
  ops: OperationsData;
  persist: (next: OperationsData) => void;
  onRemove: (id: string) => void;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const [viewerTitle, setViewerTitle] = useState("Expense proof");

  const uploadProof = useCallback(
    async (expenseId: string, file: File) => {
      const proof = await proofFromFile(file, `proofs/expenses/${expenseId}`);
      persist(attachExpenseProof(ops, expenseId, proof));
    },
    [ops, persist],
  );

  return (
    <>
      <DataTable
        headers={["Description", "Date", "Category", "Amount", "Proof", ""]}
        rows={expenses.map((e) => {
          const partner = e.partnershipId && partnerships.find((p) => p.id === e.partnershipId);
          return [
            <span key={`lbl-${e.id}`}>
              {e.label}
              {partner && (
                <Link
                  to="/documents/payments/partners/$partnershipId"
                  params={{ partnershipId: partner.id }}
                  className="mt-0.5 block text-xs font-medium text-primary hover:underline"
                >
                  Partner: {partner.name} — view proof archive
                </Link>
              )}
            </span>,
            e.date,
            expenseCategoryLabel(e.category),
            <span key={`amt-${e.id}`} className="font-medium tabular-nums text-rose-400">
              {formatFinancialINR(e.amount)}
            </span>,
            <ProofThumbnail
              key={`proof-${e.id}`}
              imageUrl={e.proof?.imageDataUrl}
              label={e.label}
              onView={(src) => {
                setViewerTitle(`${e.label} — ${formatINR(e.amount)}`);
                setViewerSrc(src);
                setViewerOpen(true);
              }}
              onUpload={e.proof?.imageDataUrl ? undefined : (file) => uploadProof(e.id, file)}
            />,
            <RowDelete key={`del-${e.id}`} onClick={() => onRemove(e.id)} />,
          ];
        })}
      />
      <ProofImageDialog
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        src={viewerSrc}
        title={viewerTitle}
        description="Uploaded proof for this expense entry."
        footer={<ProofImageDialogCloseButton onClose={() => setViewerOpen(false)} />}
      />
    </>
  );
}
