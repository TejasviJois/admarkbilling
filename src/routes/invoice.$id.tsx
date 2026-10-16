import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { NewInvoiceLink } from "@/components/invoice/NewInvoiceLink";
import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  invoiceProjectCandidates,
  resolveRelatedProject,
} from "@/lib/invoice-project-link";
import { paymentSummary } from "@/lib/project-payments";
import {
  invoicePaymentProjectPaymentId,
  removeInvoicePaymentFromProjects,
  syncInvoicePaymentToProjects,
} from "@/lib/project-payment-sync";
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

  const projectOptions = useMemo(() => {
    if (!invoice) return [];
    return invoiceProjectCandidates(ops.projects ?? [], invoice).map((project) => ({
      id: project.id,
      label: `${project.name} · ${project.client}`,
      outstanding: paymentSummary(project).pending,
    }));
  }, [invoice, ops.projects]);

  const defaultProjectId = useMemo(() => {
    if (!invoice) return undefined;
    return resolveRelatedProject(ops.projects ?? [], invoice)?.id;
  }, [invoice, ops.projects]);

  const backfillDoneFor = useRef<string | null>(null);
  useEffect(() => {
    if (phase !== "ready" || !invoice || backfillDoneFor.current === invoice.id) return;
    const linkedPayments = (ops.payments ?? []).filter(
      (payment) =>
        payment.invoiceId === invoice.id &&
        payment.amount > 0 &&
        !payment.id.startsWith("invoice-advance-"),
    );
    if (linkedPayments.length === 0) {
      backfillDoneFor.current = invoice.id;
      return;
    }
    let nextProjects = ops.projects ?? [];
    let changed = false;
    let unresolved = false;
    for (const payment of linkedPayments) {
      const mirrorId = invoicePaymentProjectPaymentId(payment.id);
      const relatedId =
        payment.projectId ?? resolveRelatedProject(nextProjects, invoice)?.id;
      if (!relatedId) {
        unresolved = true;
        continue;
      }
      const already = nextProjects.some(
        (project) =>
          project.id === relatedId &&
          (project.payments ?? []).some((item) => item.id === mirrorId),
      );
      if (already) continue;
      nextProjects = syncInvoicePaymentToProjects(nextProjects, [invoice], {
        ...payment,
        projectId: payment.projectId ?? relatedId,
      });
      changed = true;
    }
    if (!unresolved) backfillDoneFor.current = invoice.id;
    if (!changed) return;
    persistOps({ ...ops, projects: nextProjects });
  }, [phase, invoice, ops, persistOps]);

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
          let projects = ops.projects ?? [];
          for (const payId of removedPaymentIds) {
            projects = removeInvoicePaymentFromProjects(projects, payId);
          }
          persistOps(
            {
              ...ops,
              projects,
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
    const withProject: Payment = {
      ...payment,
      projectId: payment.projectId ?? defaultProjectId,
    };
    persistOps({
      ...ops,
      payments: [...(ops.payments ?? []), withProject],
      projects: syncInvoicePaymentToProjects(ops.projects ?? [], [invoice], withProject),
    });
  };

  const handleRemovePayment = (payId: string) => {
    if (!confirm("Delete this payment record?")) return;
    persistOps(
      {
        ...ops,
        payments: (ops.payments ?? []).filter((p) => p.id !== payId),
        projects: removeInvoicePaymentFromProjects(ops.projects ?? [], payId),
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
      <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            to="/invoices"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/60 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Invoices
          </Link>
          <h1 className="mt-2 truncate text-2xl font-black tracking-tight text-white sm:text-3xl">
            {invoice.number}
          </h1>
          <p className="mt-1 truncate text-xs text-white/50">{invoice.clientName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/invoice/$id/edit"
            params={{ id: invoice.id }}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 glass-card px-3.5 text-xs font-semibold text-white/80 transition-colors hover:border-white/25 hover:text-white"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Link>
          <NewInvoiceLink className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 glass-card px-3.5 text-xs font-semibold text-white/80 transition-colors hover:border-white/25 hover:text-white">
            <Plus className="h-3.5 w-3.5" />
            New
          </NewInvoiceLink>
          <button
            type="button"
            onClick={handleDelete}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3.5 text-xs font-semibold text-rose-400 transition-colors hover:bg-rose-500/20"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
          <button
            type="button"
            onClick={() => void downloadInvoicePdf(derivedInvoice!, company)}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#ff6b2b] to-[#f04400] px-4 text-xs font-bold text-white shadow-lg shadow-[#ff6b2b]/20 hover:shadow-[0_0_20px_rgba(255,107,43,0.4)] transition-all"
          >
            <Download className="h-3.5 w-3.5" />
            PDF
          </button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="invoice-preview-shell rounded-2xl border border-white/10 bg-[#0d0d12]/80 p-2 sm:p-4 shadow-2xl backdrop-blur-md">
          <InvoicePreview invoice={derivedInvoice!} company={company} />
        </div>

        <aside className="space-y-6">
          <div className="rounded-2xl border border-white/10 glass-panel p-5 space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-white/50">Status Overview</h2>
            <dl className="divide-y divide-white/5 border-y border-white/10 text-sm">
              <div className="flex items-center justify-between gap-3 py-3">
                <dt className="text-white/60 text-xs">Paid</dt>
                <dd className="font-bold tabular-nums text-emerald-400">{formatINR(paidAmount)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-3">
                <dt className="text-white/60 text-xs">Outstanding</dt>
                <dd className="font-bold tabular-nums text-rose-400">
                  {formatINR(outstandingBalance)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-3">
                <dt className="text-white/60 text-xs">Status</dt>
                <dd className="capitalize text-white font-semibold text-xs">
                  {derivedInvoice?.status?.replace(/_/g, " ")}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-white/10 glass-panel p-5 space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-white/50">Payments Log</h2>
              <button
                type="button"
                onClick={() => setPaymentDialogOpen(true)}
                className="inline-flex h-7 items-center rounded-lg bg-gradient-to-r from-[#ff6b2b] to-[#f04400] px-2.5 text-[11px] font-bold text-white shadow-sm hover:opacity-95"
              >
                Log payment
              </button>
            </div>

            <div className="divide-y divide-white/5 text-xs">
              {!advancePayment && invoicePayments.length === 0 ? (
                <p className="py-6 text-center text-white/40">No payments logged yet.</p>
              ) : (
                <>
                  {advancePayment && (
                    <div className="space-y-2 py-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold tabular-nums text-white text-sm">
                            +{formatINR(advancePayment.amount)}
                          </p>
                          <p className="mt-0.5 text-[11px] text-white/50">
                            Advance · {advancePayment.date}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase text-white/60">
                          {advancePayment.method.replace(/_/g, " ")}
                        </span>
                      </div>
                      <div className="flex flex-wrap justify-end gap-1.5 pt-1">
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
                          className="inline-flex items-center gap-1 rounded-lg border border-white/10 glass-card px-2.5 py-1 text-[11px] font-medium text-white/70 transition-colors hover:border-white/20 hover:text-white"
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
                          className="inline-flex items-center gap-1 rounded-lg border border-white/10 glass-card px-2.5 py-1 text-[11px] font-medium text-white/70 transition-colors hover:border-white/20 hover:text-white"
                        >
                          <Share2 className="h-3 w-3" /> Share
                        </button>
                      </div>
                    </div>
                  )}
                  {invoicePayments.map((pay) => (
                    <div key={pay.id} className="space-y-2 py-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold tabular-nums text-emerald-400 text-sm">
                            {pay.amount > 0 ? "+" : ""}
                            {formatINR(pay.amount)}
                          </p>
                          <p className="mt-0.5 text-[11px] text-white/50">
                            {pay.date}
                            {pay.transactionId ? ` · ${pay.transactionId}` : ""}
                          </p>
                          {pay.notes ? (
                            <p className="mt-0.5 text-[11px] text-white/40">{pay.notes}</p>
                          ) : null}
                          {pay.screenshotDataUrl ? (
                            <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-emerald-400">
                              <ImageIcon className="h-3 w-3" />
                              Proof attached
                            </p>
                          ) : null}
                        </div>
                        <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase text-white/60">
                          {pay.method.replace(/_/g, " ")}
                        </span>
                      </div>
                      <div className="flex flex-wrap justify-end gap-1.5 pt-1">
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
                          className="inline-flex items-center gap-1 rounded-lg border border-white/10 glass-card px-2.5 py-1 text-[11px] font-medium text-white/70 transition-colors hover:border-white/20 hover:text-white"
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
                          className="inline-flex items-center gap-1 rounded-lg border border-white/10 glass-card px-2.5 py-1 text-[11px] font-medium text-white/70 transition-colors hover:border-white/20 hover:text-white"
                        >
                          <Share2 className="h-3 w-3" /> Share
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemovePayment(pay.id)}
                          className="rounded-lg px-2.5 py-1 text-[11px] font-medium text-rose-400 transition-colors hover:bg-rose-500/10"
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
        projectOptions={projectOptions}
        defaultProjectId={defaultProjectId}
      />
    </div>
  );
}
