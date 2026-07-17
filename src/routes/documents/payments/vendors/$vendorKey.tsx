import { createFileRoute, Link } from "@tanstack/react-router";
import { OutgoingPaymentHistoryTable } from "@/components/documents/PaymentHistoryTable";
import { DocumentsBreadcrumb } from "@/components/documents/documents-ui";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";
import { vendorPaymentHistory } from "@/lib/document-ledger";
import { decodeEntitySlug } from "@/lib/document-slug";
import { formatINRWhole } from "@/lib/invoice-calc";

export const Route = createFileRoute("/documents/payments/vendors/$vendorKey")({
  component: DocumentsVendorDetailPage,
});

function DocumentsVendorDetailPage() {
  const { vendorKey } = Route.useParams();
  const vendorLabel = decodeEntitySlug(vendorKey);
  const { ops, persist, loading } = useOperations();

  if (loading) return <OperationsLoading />;

  const { rows, total } = vendorPaymentHistory(ops, vendorLabel);

  return (
    <div>
      <DocumentsBreadcrumb
        items={[
          { label: "Documents", to: "/documents" },
          { label: "Payments", to: "/documents/payments" },
          { label: "Vendors", to: "/documents/payments/vendors" },
          { label: vendorLabel },
        ]}
      />
      <OperationsPageHeader
        title={vendorLabel}
        description={`Vendor payout history — ${formatINRWhole(total)} paid across ${rows.length} entr${rows.length === 1 ? "y" : "ies"}.`}
      />

      <p className="mb-6 text-xs text-muted-foreground">
        Log new vendor payouts in{" "}
        <Link to="/accounts" hash="expenses" className="text-primary hover:underline">
          Accounts
        </Link>{" "}
        under External payouts (leave partner unlinked to appear here).
      </p>

      <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Payout history</h2>
        <OutgoingPaymentHistoryTable rows={rows} ops={ops} persist={persist} />
      </section>
    </div>
  );
}
