import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { NewInvoiceLink } from "@/components/invoice/NewInvoiceLink";
import { useEffect, useState } from "react";
import { ArrowLeft, Download, Pencil, Trash2, Receipt, Image as ImageIcon } from "lucide-react";
import { deleteInvoice, getInvoice, loadCompany } from "@/lib/storage";
import { logClientError } from "@/lib/client-logger";
import { downloadInvoicePdf } from "@/lib/pdf";
import InvoicePreview from "@/components/invoice/InvoicePreview";
import { PaymentFormDialog } from "@/components/invoice/PaymentFormDialog";
import { useOperations } from "@/hooks/use-operations";
import { deriveInvoiceStatus, calculateInvoicePayments, formatINR } from "@/lib/invoice-calc";
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
      <Link to="/documents/invoices" className="mt-4 inline-block text-sm text-primary hover:underline">
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
      void loadCompany().then(setCompany).catch((e) => logClientError("invoicePage.loadCompany", e));
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  const invoicePayments = (ops.payments ?? []).filter((p) => p.invoiceId === id);

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
    void deleteInvoice(invoice!.id)
      .then(() => navigate({ to: "/documents/invoices" }))
      .catch((e) => logClientError("invoicePage.delete", e));
  };

  const handleSavePayment = (payment: Payment) => {
    const nextPayments = [...(ops.payments ?? []), payment];
    persistOps({ ...ops, payments: nextPayments });
  };

  const handleRemovePayment = (payId: string) => {
    if (!confirm("Delete this payment record?")) return;
    persistOps({
      ...ops,
      payments: (ops.payments ?? []).filter((p) => p.id !== payId),
    });
  };

  if (loadError) {
    return (
      <div className="py-16 text-center text-sm text-destructive">
        {loadError}
        <Link to="/documents/invoices" className="mt-4 block text-primary hover:underline">
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/documents/invoices"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to invoices
        </Link>
        <div className="flex flex-wrap gap-2">
          <NewInvoiceLink
            className="inline-flex items-center gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm hover:bg-secondary"
          >
            <Pencil className="h-4 w-4" /> New invoice
          </NewInvoiceLink>
          <button
            type="button"
            onClick={handleDelete}
            className="inline-flex items-center gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
          <button
            type="button"
            onClick={() => void downloadInvoicePdf(derivedInvoice!, company)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            <Download className="h-4 w-4" /> Download PDF
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="invoice-preview-shell overflow-x-auto rounded-xl border border-border bg-white p-2">
          <InvoicePreview invoice={derivedInvoice!} company={company} />
        </div>

        <div className="space-y-6">
          {/* Payment Stats */}
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm space-y-3">
            <h3 className="font-semibold text-foreground text-sm border-b border-border pb-2">Financial Status</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paid Amount:</span>
                <span className="font-semibold text-green-500">{formatINR(paidAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Outstanding:</span>
                <span className="font-semibold text-destructive">{formatINR(outstandingBalance)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Dynamic Status:</span>
                <span className="font-semibold capitalize text-primary">{derivedInvoice?.status}</span>
              </div>
            </div>
          </div>

          {/* Payment Log History */}
          <div className="rounded-lg border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="font-semibold text-foreground text-sm">Payment History</h3>
              <button
                type="button"
                onClick={() => setPaymentDialogOpen(true)}
                className="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Log Payment
              </button>
            </div>
            <div className="divide-y divide-border text-xs">
              {invoicePayments.length === 0 ? (
                <div className="px-4 py-6 text-center text-muted-foreground">No payments logged.</div>
              ) : (
                invoicePayments.map((pay) => (
                  <div key={pay.id} className="p-3 space-y-1 hover:bg-muted/10">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-foreground">
                        {pay.amount > 0 ? "+" : ""}{formatINR(pay.amount)}
                      </span>
                      <span className="text-muted-foreground uppercase">{pay.method}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground flex justify-between">
                      <span>{pay.date}</span>
                      {pay.transactionId && <span>Tx: {pay.transactionId}</span>}
                    </div>
                    {pay.notes && <p className="text-[10px] text-muted-foreground mt-1">{pay.notes}</p>}
                    {pay.screenshotDataUrl && (
                      <div className="flex items-center gap-1 text-[10px] text-primary mt-1">
                        <ImageIcon className="h-3 w-3" />
                        <span>Proof attached</span>
                      </div>
                    )}
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => handleRemovePayment(pay.id)}
                        className="text-[10px] text-destructive hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <PaymentFormDialog
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        invoiceId={invoice.id}
        onSave={handleSavePayment}
      />
    </div>
  );
}
