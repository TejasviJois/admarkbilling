import { useEffect, useRef, useState } from "react";
import { ImagePlus, Plus, Trash2 } from "lucide-react";
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
import { Field } from "@/components/operations/operations-ui";
import { formatINR } from "@/lib/invoice-calc";
import { readImageAsDataUrl } from "@/lib/payment-proof";
import {
  paymentSummary,
  syncPaymentStatusFromPayments,
} from "@/lib/project-payments";
import { projectClientLabel } from "@/lib/project-status";
import type { Project, ProjectPayment } from "@/lib/types";

const EMPTY = { amount: "", date: new Date().toISOString().slice(0, 10), note: "" };

export function ProjectPaymentsDialog({
  open,
  onOpenChange,
  project,
  onUpdateProject,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
  onUpdateProject: (project: Project) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [pendingMeta, setPendingMeta] = useState<{ fileName: string; mimeType: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(EMPTY);
      setError(null);
      setPendingPreview(null);
      setPendingMeta(null);
    }
  }, [open, project?.id]);

  if (!project) return null;

  const client = projectClientLabel(project);
  const payments = project.payments ?? [];
  const { received, target, pending } = paymentSummary(project);

  const resetUpload = () => {
    setPendingPreview(null);
    setPendingMeta(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const { dataUrl, fileName, mimeType } = await readImageAsDataUrl(file);
      setPendingPreview(dataUrl);
      setPendingMeta({ fileName, mimeType });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const savePayment = () => {
    const amount = Number(form.amount);
    if (!form.date || !Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid amount and date.");
      return;
    }

    const entry: ProjectPayment = {
      id: crypto.randomUUID(),
      amount,
      date: form.date,
      note: form.note.trim() || undefined,
      proof:
        pendingPreview && pendingMeta
          ? {
              imageDataUrl: pendingPreview,
              fileName: pendingMeta.fileName,
              mimeType: pendingMeta.mimeType,
              uploadedAt: new Date().toISOString(),
            }
          : undefined,
    };

    const next = syncPaymentStatusFromPayments({
      ...project,
      payments: [entry, ...payments],
    });
    onUpdateProject(next);
    setForm(EMPTY);
    resetUpload();
    setError(null);
  };

  const removePayment = (id: string) => {
    const next = syncPaymentStatusFromPayments({
      ...project,
      payments: payments.filter((p) => p.id !== id),
    });
    onUpdateProject(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(92vh,760px)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Payment ledger</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{client}</span>
            {project.revenueValue ? (
              <>
                {" "}
                — contract{" "}
                <span className="font-medium text-foreground">{project.revenueValue}</span>
              </>
            ) : null}
            . Add each partial payment separately (e.g. two ₹12,000 transfers for a ₹24,000
            project).
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/20 p-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Received</p>
            <p className="font-semibold tabular-nums text-emerald-300">{formatINR(received)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Contract (1st ₹)</p>
            <p className="font-semibold tabular-nums">
              {target != null ? formatINR(target) : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pending</p>
            <p className="font-semibold tabular-nums text-amber-300">
              {pending != null ? formatINR(pending) : "—"}
            </p>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-dashed border-border bg-muted/10 p-4">
          <p className="text-sm font-medium text-foreground">Record payment</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Amount (₹)" id="pay-amount">
              <Input
                id="pay-amount"
                type="number"
                min={0}
                step={1}
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="12000"
              />
            </Field>
            <Field label="Date" id="pay-date">
              <Input
                id="pay-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </Field>
          </div>
          <Field label="Note (optional)" id="pay-note">
            <Input
              id="pay-note"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="1st installment, UPI ref…"
            />
          </Field>

          <div className="rounded-lg border border-dashed border-border bg-background/50 p-3">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
            {pendingPreview ? (
              <div className="space-y-2">
                <img
                  src={pendingPreview}
                  alt="Proof preview"
                  className="max-h-32 rounded-md border border-border object-contain"
                />
                <Button type="button" size="sm" variant="outline" onClick={resetUpload}>
                  Remove screenshot
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 py-3 text-sm text-muted-foreground hover:text-foreground"
              >
                <ImagePlus className="h-4 w-4" />
                Attach payment screenshot (optional)
              </button>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="button" onClick={savePayment} className="w-full sm:w-auto">
            <Plus className="h-4 w-4" /> Add payment
          </Button>
        </div>

        {payments.length > 0 ? (
          <ul className="space-y-3">
            {payments.map((payment, index) => (
              <li
                key={payment.id}
                className="flex gap-3 rounded-lg border border-border bg-card p-3 shadow-sm"
              >
                {payment.proof ? (
                  <a
                    href={payment.proof.imageDataUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0"
                  >
                    <img
                      src={payment.proof.imageDataUrl}
                      alt="Payment proof"
                      className="h-14 w-14 rounded-md border border-border object-cover"
                    />
                  </a>
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-[10px] text-muted-foreground">
                    No proof
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold tabular-nums text-foreground">
                    {formatINR(payment.amount)}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      #{payments.length - index}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">{payment.date}</p>
                  {payment.note && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{payment.note}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removePayment(payment.id)}
                  className="shrink-0 self-start rounded-md p-1.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                  aria-label="Remove payment"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-center text-sm text-muted-foreground py-4">
            No payments recorded yet. Add the first installment above.
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
