import { useRef, useState } from "react";
import { Eye, ImagePlus, Plus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FinancialSummaryPanel } from "@/components/operations/FinancialSummaryPanel";
import {
  ProofImageDialog,
  ProofImageDialogCloseButton,
} from "@/components/operations/ProofImageDialog";
import { formatINR } from "@/lib/invoice-calc";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  computeFinancialSummary,
  expenseCategoryLabel,
} from "@/lib/financial";
import { readImageAsDataUrl } from "@/lib/payment-proof";
import type { ExpenseCategory, ExpenseEntry, OperationsData } from "@/lib/types";
import { DataSection, DataTable, EmptyRow, Field, RowDelete } from "./operations-ui";

export function ExpensesSection({
  ops,
  persist,
}: {
  ops: OperationsData;
  persist: (next: OperationsData) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const summary = computeFinancialSummary(ops);
  const loggedExpenses = ops.expenses.filter((e) => !e.isBaseline);

  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState<ExpenseCategory>("company");
  const [partnershipId, setPartnershipId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [proofMeta, setProofMeta] = useState<{ fileName: string; mimeType: string } | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const [viewerTitle, setViewerTitle] = useState("Expense proof");

  const resetForm = () => {
    setLabel("");
    setAmount("");
    setCategory("company");
    setPartnershipId("");
    setNotes("");
    setError(null);
    setProofPreview(null);
    setProofMeta(null);
    setDate(new Date().toISOString().slice(0, 10));
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const { dataUrl, fileName, mimeType } = await readImageAsDataUrl(file);
      setProofPreview(dataUrl);
      setProofMeta({ fileName, mimeType });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read image.");
    } finally {
      setBusy(false);
    }
  };

  const addExpense = () => {
    if (!label.trim() || !amount || !date) {
      setError("Description, amount, and date are required.");
      return;
    }
    if (!proofPreview || !proofMeta) {
      setError("Upload a bank screenshot or receipt — proof is required for new expenses.");
      return;
    }
    if (date <= summary.baseline.asOfDate) {
      setError(`Date must be after the historical baseline (${summary.baseline.asOfDate}).`);
      return;
    }

    const expense: ExpenseEntry = {
      id: crypto.randomUUID(),
      label: label.trim(),
      amount: Number(amount),
      date,
      category,
      partnershipId: category === "external_payout" && partnershipId ? partnershipId : undefined,
      notes: notes.trim() || undefined,
      proof: {
        imageDataUrl: proofPreview,
        fileName: proofMeta.fileName,
        mimeType: proofMeta.mimeType,
        uploadedAt: new Date().toISOString(),
      },
    };

    persist({ ...ops, expenses: [expense, ...ops.expenses] });
    resetForm();
  };

  const removeExpense = (id: string) => {
    persist({ ...ops, expenses: ops.expenses.filter((e) => e.id !== id) });
  };

  const openProof = (expense: ExpenseEntry) => {
    if (!expense.proof?.imageDataUrl) return;
    setViewerTitle(`${expense.label} — ${formatINR(expense.amount)}`);
    setViewerSrc(expense.proof.imageDataUrl);
    setViewerOpen(true);
  };

  return (
    <div className="space-y-8">
      <FinancialSummaryPanel summary={summary} />

      <DataSection
        title="Log new expense"
        description="Every new payout or expense after the baseline requires proof (bank screenshot or receipt)."
        icon={<Wallet className="h-5 w-5 text-primary" strokeWidth={2} />}
      >
        {error && (
          <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="mb-6 grid gap-4 rounded-lg border border-dashed border-border bg-muted/20 p-4 lg:grid-cols-2">
          <Field label="Description" id="exp-label">
            <Input
              id="exp-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Vendor payment, software, founder draw…"
            />
          </Field>
          <Field label="Category" id="exp-category">
            <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
              <SelectTrigger id="exp-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {EXPENSE_CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Amount (₹)" id="exp-amount">
            <Input
              id="exp-amount"
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="Date" id="exp-date">
            <Input id="exp-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          {category === "external_payout" && ops.partnerships.length > 0 && (
            <Field label="Partner / vendor (optional)" id="exp-partner">
              <Select
                value={partnershipId || "__none__"}
                onValueChange={(v) => setPartnershipId(v === "__none__" ? "" : v)}
              >
                <SelectTrigger id="exp-partner">
                  <SelectValue placeholder="Select partner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Not linked —</SelectItem>
                  {ops.partnerships.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field label="Notes (optional)" id="exp-notes">
            <Input
              id="exp-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reference, UTR, invoice #…"
            />
          </Field>
          <div className="lg:col-span-2">
            <Field label="Proof (required)" id="exp-proof">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={inputRef}
                  id="exp-proof"
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => void handleFile(e.target.files?.[0])}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => inputRef.current?.click()}
                >
                  <ImagePlus className="h-4 w-4" />
                  {proofPreview ? "Change screenshot" : "Upload screenshot"}
                </Button>
                {proofPreview && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setViewerTitle("New expense — proof preview");
                      setViewerSrc(proofPreview);
                      setViewerOpen(true);
                    }}
                  >
                    <Eye className="h-4 w-4" />
                    Preview
                  </Button>
                )}
                {proofMeta && (
                  <span className="text-xs text-muted-foreground">{proofMeta.fileName}</span>
                )}
              </div>
            </Field>
          </div>
          <div className="flex justify-end lg:col-span-2">
            <Button type="button" onClick={addExpense} disabled={busy}>
              <Plus className="h-4 w-4" /> Add expense
            </Button>
          </div>
        </div>

        {loggedExpenses.length === 0 ? (
          <EmptyRow message="No new expenses logged yet. Historical totals are in the summary above." />
        ) : (
          <DataTable
            headers={["Description", "Date", "Category", "Amount", "Proof", ""]}
            rows={loggedExpenses.map((e) => {
              const partner =
                e.partnershipId &&
                ops.partnerships.find((p) => p.id === e.partnershipId)?.name;
              return [
                <span key={`lbl-${e.id}`}>
                  {e.label}
                  {partner && (
                    <span className="mt-0.5 block text-xs text-muted-foreground">{partner}</span>
                  )}
                </span>,
                e.date,
                expenseCategoryLabel(e.category),
                formatINR(e.amount),
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
                <RowDelete key={`del-${e.id}`} onClick={() => removeExpense(e.id)} />,
              ];
            })}
          />
        )}
      </DataSection>

      <ProofImageDialog
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        src={viewerSrc}
        title={viewerTitle}
        description="Uploaded proof for this expense entry."
        footer={<ProofImageDialogCloseButton onClose={() => setViewerOpen(false)} />}
      />
    </div>
  );
}
