import { lazy, Suspense } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { InvoiceFormSkeleton } from "@/components/invoice/InvoiceFormSkeleton";
import { prefetchInvoiceEditor } from "@/lib/prefetch-invoice-editor";

const InvoiceForm = lazy(() => import("@/components/invoice/InvoiceForm"));

export const Route = createFileRoute("/new")({
  beforeLoad: ({ context }) => {
    prefetchInvoiceEditor(context.queryClient);
  },
  component: NewInvoicePage,
});

function NewInvoicePage() {
  const navigate = useNavigate();
  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Step 1 — Details
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Create new invoice</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Invoice number is assigned automatically in sequence for the financial year (AM/YY-YY/0001).
        </p>
      </div>
      <Suspense fallback={<InvoiceFormSkeleton />}>
        <InvoiceForm
          onSaved={(inv) => navigate({ to: "/invoice/$id", params: { id: inv.id } })}
        />
      </Suspense>
    </div>
  );
}
