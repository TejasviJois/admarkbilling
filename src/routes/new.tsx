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
    <Suspense fallback={<InvoiceFormSkeleton />}>
      <InvoiceForm onSaved={(inv) => navigate({ to: "/invoice/$id", params: { id: inv.id } })} />
    </Suspense>
  );
}
