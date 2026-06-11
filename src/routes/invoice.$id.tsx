import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { NewInvoiceLink } from "@/components/invoice/NewInvoiceLink";
import { useEffect, useState } from "react";
import { ArrowLeft, Download, Pencil, Trash2 } from "lucide-react";
import { deleteInvoice, getInvoice, loadCompany } from "@/lib/storage";
import { logClientError } from "@/lib/client-logger";
import { downloadInvoicePdf } from "@/lib/pdf";
import InvoicePreview from "@/components/invoice/InvoicePreview";
import type { CompanySettings, Invoice } from "@/lib/types";

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
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "missing">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);

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

  const handleDelete = () => {
    if (!confirm("Delete this invoice?")) return;
    void deleteInvoice(invoice.id)
      .then(() => navigate({ to: "/documents/invoices" }))
      .catch((e) => logClientError("invoicePage.delete", e));
  };

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
            onClick={() => void downloadInvoicePdf(invoice, company)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            <Download className="h-4 w-4" /> Download PDF
          </button>
        </div>
      </div>

      <InvoicePreview invoice={invoice} company={company} />
    </div>
  );
}
