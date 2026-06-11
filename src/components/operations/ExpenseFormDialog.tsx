import { useEffect, useRef, useState } from "react";
import { Eye, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "@/components/operations/operations-ui";
import {
  ProofImageDialog,
  ProofImageDialogCloseButton,
} from "@/components/operations/ProofImageDialog";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  computeFinancialSummary,
} from "@/lib/financial";
import { readImageAsDataUrl } from "@/lib/payment-proof";
import type { ExpenseCategory, ExpenseEntry, OperationsData } from "@/lib/types";

const EMPTY = {
  label: "",
  amount: "",
  date: new Date().toISOString().slice(0, 10),
  category: "company" as ExpenseCategory,
  partnershipId: "",
  notes: "",
};

export function ExpenseFormDialog({
  open,
  onOpenChange,
  ops,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ops: OperationsData;
  onSave: (expense: ExpenseEntry) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const summary = computeFinancialSummary(ops);

  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [proofMeta, setProofMeta] = useState<{ fileName: string; mimeType: string } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({ ...EMPTY, date: new Date().toISOString().slice(0, 10) });
    setError(null);
    setProofPreview(null);
    setProofMeta(null);
    if (inputRef.current) inputRef.current.value = "";
  }, [open]);

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

  const submit = () => {
    if (!form.label.trim() || !form.amount || !form.date) {
      setError("Description, amount, and date are required.");
      return;
    }
    if (!proofPreview || !proofMeta) {
      setError("Upload a bank screenshot or receipt — proof is required.");
      return;
    }
    if (form.date < summary.baseline.asOfDate) {
      setError(`Date cannot be before the historical baseline (${summary.baseline.asOfDate}).`);
      return;
    }

    onSave({
      id: crypto.randomUUID(),
      label: form.label.trim(),
      amount: Number(form.amount),
      date: form.date,
      category: form.category,
      partnershipId:
        form.category === "external_payout" && form.partnershipId ? form.partnershipId : undefined,
      notes: form.notes.trim() || undefined,
      proof: {
        imageDataUrl: proofPreview,
        fileName: proofMeta.fileName,
        mimeType: proofMeta.mimeType,
        uploadedAt: new Date().toISOString(),
      },
    });
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Log expense</DialogTitle>
            <DialogDescription>
              New payouts on or after the baseline date require proof (bank screenshot or receipt).
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Description" id="exp-dialog-label">
              <Input
                id="exp-dialog-label"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="Vendor payment, software…"
              />
            </Field>
            <Field label="Category" id="exp-dialog-category">
              <Select
                value={form.category}
                onValueChange={(v) => setForm((f) => ({ ...f, category: v as ExpenseCategory }))}
              >
                <SelectTrigger id="exp-dialog-category">
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
            <Field label="Amount (₹)" id="exp-dialog-amount">
              <Input
                id="exp-dialog-amount"
                type="number"
                min={0}
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </Field>
            <Field label="Date" id="exp-dialog-date">
              <Input
                id="exp-dialog-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </Field>
            {form.category === "external_payout" && ops.partnerships.length > 0 && (
              <Field label="Link to partner" id="exp-dialog-partner">
                <Select
                  value={form.partnershipId || "__none__"}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, partnershipId: v === "__none__" ? "" : v }))
                  }
                >
                  <SelectTrigger id="exp-dialog-partner">
                    <SelectValue placeholder="Select partner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Vendor only (not linked)</SelectItem>
                    {ops.partnerships.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Linked partner payouts appear under Documents → Payments → Partners with proof.
                </p>
              </Field>
            )}
            <Field label="Notes (optional)" id="exp-dialog-notes">
              <Input
                id="exp-dialog-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="UTR, invoice #…"
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Proof (required)" id="exp-dialog-proof">
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    ref={inputRef}
                    id="exp-dialog-proof"
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
                    <Button type="button" variant="ghost" size="sm" onClick={() => setPreviewOpen(true)}>
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
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={submit} disabled={busy}>
              Add expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ProofImageDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        src={proofPreview}
        title="Proof preview"
        description="Uploaded proof for this expense."
        footer={<ProofImageDialogCloseButton onClose={() => setPreviewOpen(false)} />}
      />
    </>
  );
}
