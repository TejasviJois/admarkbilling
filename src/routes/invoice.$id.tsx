import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { NewInvoiceLink } from "@/components/invoice/NewInvoiceLink";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Download,
  Pencil,
  Plus,
  Trash2,
  Share2,
  Image as ImageIcon,
} from "lucide-react";
import { deleteInvoice, getInvoice, loadCompany } from "@/lib/storage";
import { logClientError } from "@/lib/client-logger";
import { downloadInvoicePdf } from "@/lib/pdf";
import InvoicePreview from "@/components/invoice/InvoicePreview";
import { PaymentFormDialog } from "@/components/invoice/PaymentFormDialog";
import { useOperations } from "@/hooks/use-operations";
import { deriveInvoiceStatus, calculateInvoicePayments, formatINR } from "@/lib/invoice-calc";
import { downloadPaymentReceiptPdf, sharePaymentReceiptPdf } from "@/lib/payment-receipt-pdf";
import type { CompanySettings, Invoice, Payment } from "@/lib/types";

/** Reject path-like or absurd IDs before hitting storage / server. */
function isPlausibleInvoiceId(raw: string): boolean {
  const id = raw.trim();
  if (!id || id.length > 220) return false;
  if (id.includes("/") || id.includes("\\") || id.includes("..")) return false;
  return true;
}

function InvoiceNotFoundView() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Invoice not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This link may be wrong or the invoice was removed.
      </p>
      <Link to="/invoices" className="mt-4 inline-block text-sm text-primary hover:underline">
        ← Back to invoices
      </Link>
    </div>
  );
}

export const Route = createFileRoute("/invoice/$id")({
  component: InvoicePage,
  notFoundComponent: InvoiceNotFoundView,
});

function InvoicePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { ops, persist: persistOps } = useOperations();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "missing">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);

  useEffect(() => {
    setInvoice(null);
    setCompany(null);
    setLoadError(null);

    if (!isPlausibleInvoiceId(id)) {
      setPhase("missing");
      return;
    }

    setPhase("loading");
    let cancelled = false;

    void (async () => {
      try {
        const inv = await getInvoice(id);
        if (cancelled) return;
        if (!inv) {
          setPhase("missing");
          return;
        }
        const co = await loadCompany();
        if (cancelled) return;
        setInvoice(inv);
        setCompany(co);
        setPhase("ready");
      } catch (e) {
        if (cancelled) return;
        logClientError("invoicePage.load", e);
        setLoadError(e instanceof Error ? e.message : "Failed to load invoice");
        setPhase("ready");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    const refresh = () =>
      void loadCompany()
        .then(setCompany)
        .catch((e) => logClientError("invoicePage.loadCompany", e));
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  const invoicePayments = (ops.payments ?? [])
    .filter((p) => p.invoiceId === id)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  const derivedInvoice = invoice
    ? {
        ...invoice,
        status: deriveInvoiceStatus(invoice, ops.payments ?? []),
      }
    : null;

  const { paidAmount, outstandingBalance } = invoice
    ? calculateInvoicePayments(invoice, ops.payments ?? [])
    : { paidAmount: 0, outstandingBalance: 0 };

  const handleDelete = () => {
    if (!confirm("Delete this invoice?")) return;
    const inv = invoice!;
    void deleteInvoice(inv.id)
      .then(() => {
        const removedPaymentIds = (ops.payments ?? [])
          .filter((p) => p.invoiceId === inv.id)
          .map((p) => p.id);
        if (removedPaymentIds.length > 0) {
          persistOps(
            {
              ...ops,
              payments: (ops.payments ?? []).filter((p) => p.invoiceId !== inv.id),
            },
            { deleteIds: { payments: removedPaymentIds } },
          );
        }
        navigate({ to: "/invoices" });
      })
      .catch((e) => logClientError("invoicePage.delete", e));
  };

  const handleSavePayment = (payment: Payment) => {
    if (!invoice) return;
    persistOps({
      ...ops,
      payments: [...(ops.payments ?? []), payment],
    });
  };

  const handleRemovePayment = (payId: string) => {
    if (!confirm("Delete this payment record?")) return;
    persistOps(
      {
        ...ops,
        payments: (ops.payments ?? []).filter((p) => p.id !== payId),
      },
      { deleteIds: { payments: [payId] } },
    );
  };

  const advancePayment: Payment | null =
    invoice && invoice.advance > 0
      ? {
          id: `invoice-advance-${invoice.id}`,
          invoiceId: invoice.id,
          amount: invoice.advance,
          date: invoice.paymentDate || invoice.date,
          method: invoice.paymentMode || "other",
          notes: "Advance recorded on the original invoice.",
        }
      : null;

  const receiptOptions = (payment: Payment, isInvoiceAdvance = false) => {
    if (!invoice || !company) return null;
    return {
      invoice,
      payment,
      invoicePayments,
      company,
      isInvoiceAdvance,
    };
  };

  if (loadError) {
    return (
      <div className="py-16 text-center text-sm text-destructive">
        {loadError}
        <Link to="/invoices" className="mt-4 block text-primary hover:underline">
          ← Back to invoices
        </Link>
      </div>
    );
  }

  if (phase === "missing") {
    return <InvoiceNotFoundView />;
  }

  if (phase === "loading" || !invoice || !company) {
    return (
      <div className="py-20 text-center text-sm text-muted-foreground" aria-live="polite">
        Loading invoice…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-border/80 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            to="/invoices"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Invoices
          </Link>
          <h1 className="mt-1.5 truncate text-lg font-semibold tracking-tight text-foreground sm:text-xl">
            {invoice.number}
          </h1>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{invoice.clientName}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Link
            to="/invoice/$id/edit"
            params={{ id: invoice.id }}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/80 px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted/40"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Link>
          <NewInvoiceLink className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/80 px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted/40">
            <Plus className="h-3.5 w-3.5" />
            New
          </NewInvoiceLink>
          <button
            type="button"
            onClick={handleDelete}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/80 px-3 text-xs font-medium text-rose-400 transition-colors hover:bg-rose-500/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
          <button
            type="button"
            onClick={() => void downloadInvoicePdf(derivedInvoice!, company)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Download className="h-3.5 w-3.5" />
            PDF
          </button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="invoice-preview-shell rounded-lg border border-border/80 bg-zinc-100/90 p-2 dark:bg-zinc-950/40 sm:p-3">
          <InvoicePreview invoice={derivedInvoice!} company={company} />
        </div>

        <aside className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-sm font-medium text-foreground">Status</h2>
            <dl className="divide-y divide-border/80 border-y border-border/80 text-sm">
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-muted-foreground">Paid</dt>
                <dd className="font-medium tabular-nums text-emerald-400">{formatINR(paidAmount)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-muted-foreground">Outstanding</dt>
                <dd className="font-medium tabular-nums text-rose-400">
                  {formatINR(outstandingBalance)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-muted-foreground">Status</dt>
                <dd className="capitalize text-foreground">
                  {derivedInvoice?.status?.replace(/_/g, " ")}
                </dd>
              </div>
            </dl>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-foreground">Payments</h2>
              <button
                type="button"
                onClick={() => setPaymentDialogOpen(true)}
                className="inline-flex h-7 items-center rounded-md bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Log payment
              </button>
            </div>

            <div className="divide-y divide-border/80 border-y border-border/80 text-xs">
              {!advancePayment && invoicePayments.length === 0 ? (
                <p className="py-6 text-center text-muted-foreground">No payments logged.</p>
              ) : (
                <>
                  {advancePayment && (
                    <div className="space-y-2 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium tabular-nums text-foreground">
                            +{formatINR(advancePayment.amount)}
                          </p>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            Advance · {advancePayment.date}
                          </p>
                        </div>
                        <span className="shrink-0 capitalize text-muted-foreground">
                          {advancePayment.method.replace(/_/g, " ")}
                        </span>
                      </div>
                      <div className="flex flex-wrap justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            const options = receiptOptions(advancePayment, true);
                            if (options) {
                              void downloadPaymentReceiptPdf(options).catch((error) =>
                                logClientError("invoicePage.downloadAdvanceReceipt", error),
                              );
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                        >
                          <Download className="h-3 w-3" /> Receipt
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const options = receiptOptions(advancePayment, true);
                            if (options) {
                              void sharePaymentReceiptPdf(options).catch((error) =>
                                logClientError("invoicePage.shareAdvanceReceipt", error),
                              );
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                        >
                          <Share2 className="h-3 w-3" /> Share
                        </button>
                      </div>
                    </div>
                  )}
                  {invoicePayments.map((pay) => (
                    <div key={pay.id} className="space-y-2 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium tabular-nums text-foreground">
                            {pay.amount > 0 ? "+" : ""}
                            {formatINR(pay.amount)}
                          </p>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            {pay.date}
                            {pay.transactionId ? ` · ${pay.transactionId}` : ""}
                          </p>
                          {pay.notes ? (
                            <p className="mt-0.5 text-[10px] text-muted-foreground">{pay.notes}</p>
                          ) : null}
                          {pay.screenshotDataUrl ? (
                            <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                              <ImageIcon className="h-3 w-3" />
                              Proof attached
                            </p>
                          ) : null}
                        </div>
                        <span className="shrink-0 capitalize text-muted-foreground">
                          {pay.method.replace(/_/g, " ")}
                        </span>
                      </div>
                      <div className="flex flex-wrap justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            const options = receiptOptions(pay);
                            if (options) {
                              void downloadPaymentReceiptPdf(options).catch((error) =>
                                logClientError("invoicePage.downloadPaymentReceipt", error),
                              );
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                        >
                          <Download className="h-3 w-3" /> Receipt
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const options = receiptOptions(pay);
                            if (options) {
                              void sharePaymentReceiptPdf(options).catch((error) =>
                                logClientError("invoicePage.sharePaymentReceipt", error),
                              );
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                        >
                          <Share2 className="h-3 w-3" /> Share
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemovePayment(pay.id)}
                          className="rounded-md px-2 py-1 text-rose-400 transition-colors hover:bg-rose-500/10"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </aside>
      </div>

      <PaymentFormDialog
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        invoiceId={invoice.id}
        onSave={handleSavePayment}
        outstandingBalance={outstandingBalance}
      />
    </div>
  );
}
