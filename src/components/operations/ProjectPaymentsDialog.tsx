import { useEffect, useRef, useState } from "react";
import { CalendarClock, CheckCircle2, Eye, ImagePlus, Pencil, Plus, Repeat, Trash2, X } from "lucide-react";
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
import {
  ProofImageDialog,
  ProofImageDialogCloseButton,
} from "@/components/operations/ProofImageDialog";
import { formatINRWhole } from "@/lib/invoice-calc";
import { readImageAsDataUrl } from "@/lib/payment-proof";
import { resolveProjectBilling } from "@/lib/project-billing";
import {
  paymentSummary,
  resolvePaymentProof,
  syncPaymentStatusFromPayments,
} from "@/lib/project-payments";
import { projectClientLabel } from "@/lib/project-status";
import type { Project, ProjectPayment } from "@/lib/types";

const EMPTY = {
  amount: "",
  date: new Date().toISOString().slice(0, 10),
  note: "",
  recurring: false,
};

/** "2026-07-17" → "July 2026" for auto-labelling monthly installments. */
function monthLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

/** Next month's date (same day, clamped by JS Date) after the latest recurring payment. */
function nextRecurringDue(payments: ProjectPayment[]): string | null {
  const recurring = payments.filter((p) => p.recurring);
  if (recurring.length === 0) return null;
  const latest = recurring.reduce((a, b) => (a.date >= b.date ? a : b));
  const d = new Date(`${latest.date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

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
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const [viewerMode, setViewerMode] = useState<"pending" | "saved">("pending");
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(EMPTY);
      setError(null);
      setPendingPreview(null);
      setPendingMeta(null);
      setViewerOpen(false);
      setViewerSrc(null);
      setEditingPaymentId(null);
    }
  }, [open, project?.id]);

  if (!project) return null;

  const client = projectClientLabel(project);
  const payments = project.payments ?? [];
  const { received, historicalReceived, receivedAfterMigration, target, pending } =
    paymentSummary(project);
  const billing = resolveProjectBilling(project);
  const monthlyAmount =
    billing.monthlyAmount ??
    (billing.maintenanceAmount && billing.maintenanceMonths
      ? Math.round(billing.maintenanceAmount / billing.maintenanceMonths)
      : null);
  const nextDue = nextRecurringDue(payments);

  const prefillNextInstallment = () => {
    setEditingPaymentId(null);
    setForm({
      amount: monthlyAmount != null ? String(monthlyAmount) : form.amount,
      date: nextDue ?? new Date().toISOString().slice(0, 10),
      note: "",
      recurring: true,
    });
    setError(null);
  };

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
      setViewerSrc(dataUrl);
      setViewerMode("pending");
      setViewerOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const openSavedProof = (src: string) => {
    setViewerSrc(src);
    setViewerMode("saved");
    setViewerOpen(true);
  };

  const cancelEdit = () => {
    setEditingPaymentId(null);
    setForm(EMPTY);
    resetUpload();
    setError(null);
  };

  const startEdit = (payment: ProjectPayment) => {
    const proof = resolvePaymentProof(project, payment);
    setEditingPaymentId(payment.id);
    setForm({
      amount: String(payment.amount),
      date: payment.date,
      note: payment.note ?? "",
      recurring: payment.recurring ?? false,
    });
    setError(null);
    if (proof?.imageDataUrl) {
      setPendingPreview(proof.imageDataUrl);
      setPendingMeta({
        fileName: proof.fileName ?? "payment-proof",
        mimeType: proof.mimeType ?? "image/jpeg",
      });
    } else {
      resetUpload();
    }
  };

  const upsertPayment = () => {
    const amount = Number(form.amount);
    if (!form.date || !Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid amount and date.");
      return;
    }

    const editing = editingPaymentId
      ? payments.find((p) => p.id === editingPaymentId)
      : undefined;
    const existingProof = editing ? resolvePaymentProof(project, editing) : undefined;

    let proof = existingProof
      ? {
          imageDataUrl: existingProof.imageDataUrl,
          fileName: existingProof.fileName,
          mimeType: existingProof.mimeType,
          uploadedAt: existingProof.uploadedAt,
        }
      : undefined;

    if (pendingPreview && pendingMeta) {
      proof = {
        imageDataUrl: pendingPreview,
        fileName: pendingMeta.fileName,
        mimeType: pendingMeta.mimeType,
        uploadedAt: new Date().toISOString(),
      };
    }

    if (!proof?.imageDataUrl) {
      setError("Attach a payment screenshot before saving.");
      return;
    }

    // Recurring installments get an automatic month label when no note is given.
    const note =
      form.note.trim() ||
      (form.recurring ? `${monthLabel(form.date)} installment`.trim() : "") ||
      undefined;

    if (editingPaymentId) {
      const next = syncPaymentStatusFromPayments({
        ...project,
        payments: payments.map((p) =>
          p.id === editingPaymentId
            ? {
                ...p,
                amount,
                date: form.date,
                note,
                recurring: form.recurring || undefined,
                proof,
              }
            : p,
        ),
      });
      onUpdateProject(next);
      cancelEdit();
      return;
    }

    const entry: ProjectPayment = {
      id: crypto.randomUUID(),
      amount,
      date: form.date,
      note,
      recurring: form.recurring || undefined,
      proof,
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
    const filtered = payments.filter((p) => p.id !== id);
    const legacyProofs = (project.paymentProofs ?? []).filter((p) => p.id !== id);
    const base =
      filtered.length === 0
        ? {
            ...project,
            payments: [] as typeof payments,
            paymentProofs: undefined,
            paymentStatus: undefined,
          }
        : {
            ...project,
            payments: filtered,
            paymentProofs: legacyProofs.length ? legacyProofs : undefined,
          };
    onUpdateProject(syncPaymentStatusFromPayments(base));
  };

  return (
    <>
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
              . Add each installment separately — screenshot is required for every payment.
            </DialogDescription>
          </DialogHeader>

        <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Total received</p>
              <p className="font-semibold tabular-nums text-emerald-300">{formatINRWhole(received)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Contract value</p>
              <p className="font-semibold tabular-nums">
                {target != null ? formatINRWhole(target) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pending</p>
              <p className="font-semibold tabular-nums text-amber-300">
                {pending != null ? formatINRWhole(pending) : "—"}
              </p>
            </div>
          </div>
          {historicalReceived > 0 && (
            <p className="mt-3 border-t border-border/60 pt-2 text-xs text-muted-foreground">
              {formatINRWhole(historicalReceived)} collected before migration (imported from the
              Ground Zero Excel — no individual entries or screenshots exist for it)
              {receivedAfterMigration > 0
                ? ` + ${formatINRWhole(receivedAfterMigration)} received since.`
                : ". New installments are logged below."}
            </p>
          )}
        </div>

        {monthlyAmount != null && !editingPaymentId && (
          <button
            type="button"
            onClick={prefillNextInstallment}
            className="flex w-full items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 text-left text-sm text-foreground transition hover:bg-primary/10"
          >
            <CalendarClock className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">
              <span className="font-medium">Add monthly installment</span>
              <span className="ml-1 text-muted-foreground">
                {formatINRWhole(monthlyAmount)}
                {nextDue ? ` — next due ${nextDue}` : ""}
              </span>
            </span>
          </button>
        )}

        <div className="space-y-3 rounded-lg border border-dashed border-border bg-muted/10 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">
              {editingPaymentId ? "Edit payment" : "Record payment"}
            </p>
            {editingPaymentId && (
              <button
                type="button"
                onClick={cancelEdit}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
                Cancel edit
              </button>
            )}
          </div>
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
              placeholder={
                form.recurring ? `${monthLabel(form.date)} installment` : "1st installment, UPI ref…"
              }
            />
          </Field>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-background/50 p-3">
            <input
              type="checkbox"
              checked={form.recurring}
              onChange={(e) => {
                const recurring = e.target.checked;
                setForm((f) => ({
                  ...f,
                  recurring,
                  amount:
                    recurring && !f.amount && monthlyAmount != null
                      ? String(monthlyAmount)
                      : f.amount,
                }));
              }}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Repeat className="h-3.5 w-3.5 text-primary" />
                Monthly recurring payment
              </span>
              <span className="text-xs text-muted-foreground">
                Marks this as a monthly installment
                {monthlyAmount != null ? ` (contract ${formatINRWhole(monthlyAmount)}/month)` : ""}.
                The note is auto-labelled with the month, and the ledger suggests next month's
                installment for you.
              </span>
            </span>
          </label>

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
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setViewerSrc(pendingPreview);
                      setViewerMode("pending");
                      setViewerOpen(true);
                    }}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View full size
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={resetUpload}>
                    Remove screenshot
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 py-3 text-sm text-muted-foreground hover:text-foreground"
              >
                <ImagePlus className="h-4 w-4" />
                Attach payment screenshot (required)
              </button>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            type="button"
            onClick={upsertPayment}
            disabled={(!pendingPreview && !editingPaymentId) || busy}
            className="w-full sm:w-auto"
          >
            {editingPaymentId ? (
              <>
                <CheckCircle2 className="h-4 w-4" /> Save changes
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" /> Add payment
              </>
            )}
          </Button>
        </div>

        {payments.length > 0 ? (
          <ul className="space-y-3">
            {payments.map((payment, index) => {
              const proof = resolvePaymentProof(project, payment);
              return (
              <li
                key={payment.id}
                className="flex gap-3 rounded-lg border border-border bg-card p-3 shadow-sm"
              >
                {proof?.imageDataUrl ? (
                  <button
                    type="button"
                    onClick={() => openSavedProof(proof.imageDataUrl)}
                    className="group relative shrink-0"
                    aria-label="View payment proof"
                  >
                    <img
                      src={proof.imageDataUrl}
                      alt="Payment proof"
                      className="h-14 w-14 rounded-md border border-border object-cover transition group-hover:ring-2 group-hover:ring-primary/40"
                    />
                    <span className="absolute inset-0 flex items-center justify-center rounded-md bg-black/40 opacity-0 transition group-hover:opacity-100">
                      <Eye className="h-4 w-4 text-white" />
                    </span>
                  </button>
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 text-[10px] text-amber-400/90">
                    No proof
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold tabular-nums text-foreground">
                    {formatINRWhole(payment.amount)}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      #{payments.length - index}
                    </span>
                    {payment.recurring && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary align-middle">
                        <Repeat className="h-2.5 w-2.5" />
                        Monthly
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">{payment.date}</p>
                  {payment.note && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{payment.note}</p>
                  )}
                  {proof?.imageDataUrl && (
                    <button
                      type="button"
                      onClick={() => openSavedProof(proof.imageDataUrl)}
                      className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <Eye className="h-3 w-3" />
                      View proof
                    </button>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-1 self-start">
                  <button
                    type="button"
                    onClick={() => startEdit(payment)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Edit payment"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removePayment(payment.id)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                    aria-label="Remove payment"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
            })}
          </ul>
        ) : (
          <p className="text-center text-sm text-muted-foreground py-4">
            {historicalReceived > 0
              ? "No installments since migration. New payments are recorded here with screenshots."
              : "No payments recorded yet. Add the first installment above."}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

      <ProofImageDialog
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        src={viewerSrc}
        title={viewerMode === "pending" ? "Confirm payment screenshot" : "Payment proof"}
        description={
          viewerMode === "pending"
            ? "Check the screenshot is correct before adding this payment."
            : undefined
        }
        footer={
          viewerMode === "pending" ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setViewerOpen(false);
                  resetUpload();
                }}
              >
                Replace photo
              </Button>
              <Button type="button" onClick={() => setViewerOpen(false)}>
                Looks good
              </Button>
            </>
          ) : (
            <ProofImageDialogCloseButton onClose={() => setViewerOpen(false)} />
          )
        }
      />
    </>
  );
}
