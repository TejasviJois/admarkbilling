import { lazy, Suspense, useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { InvoiceFormSkeleton } from "@/components/invoice/InvoiceFormSkeleton";
import { prefetchInvoiceEditor } from "@/lib/prefetch-invoice-editor";
import { getInvoice } from "@/lib/storage";
import { logClientError } from "@/lib/client-logger";
import type { Invoice } from "@/lib/types";

const InvoiceForm = lazy(() => import("@/components/invoice/InvoiceForm"));

export const Route = createFileRoute("/invoice_/$id/edit")({
  beforeLoad: ({ context }) => prefetchInvoiceEditor(context.queryClient),
  component: EditInvoicePage,
});

function EditInvoicePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setInvoice(null);
    setMissing(false);
    setLoadError(null);
    void getInvoice(id)
      .then((inv) => {
        if (cancelled) return;
        if (!inv) setMissing(true);
        else setInvoice(inv);
      })
      .catch((e) => {
        if (cancelled) return;
        logClientError("invoiceEdit.load", e);
        setLoadError(e instanceof Error ? e.message : "Failed to load invoice");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

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

  if (missing) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Invoice not found</h1>
        <Link to="/invoices" className="mt-4 inline-block text-sm text-primary hover:underline">
          ← Back to invoices
        </Link>
      </div>
    );
  }

  if (!invoice) {
    return <InvoiceFormSkeleton />;
  }

  return (
    <Suspense fallback={<InvoiceFormSkeleton />}>
      <InvoiceForm
        existing={invoice}
        onSaved={(inv) => navigate({ to: "/invoice/$id", params: { id: inv.id } })}
      />
    </Suspense>
  );
}
