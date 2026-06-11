import { createFileRoute } from "@tanstack/react-router";
import { ClientPaymentHistoryTable } from "@/components/documents/PaymentHistoryTable";
import { DocumentsBreadcrumb } from "@/components/documents/documents-ui";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";
import { clientPaymentHistory } from "@/lib/document-ledger";
import { decodeEntitySlug } from "@/lib/document-slug";
import { formatINRWhole } from "@/lib/invoice-calc";

export const Route = createFileRoute("/documents/payments/clients/$clientKey")({
  component: DocumentsClientDetailPage,
});

function DocumentsClientDetailPage() {
  const { clientKey } = Route.useParams();
  const clientName = decodeEntitySlug(clientKey);
  const { ops, persist, loading } = useOperations();

  if (loading) return <OperationsLoading />;

  const { rows, projects, total, totalContractValue } = clientPaymentHistory(ops, clientName);

  return (
    <div>
      <DocumentsBreadcrumb
        items={[
          { label: "Documents", to: "/documents" },
          { label: "Payments", to: "/documents/payments" },
          { label: "Clients", to: "/documents/payments/clients" },
          { label: clientName },
        ]}
      />
      <OperationsPageHeader
        title={clientName}
        description={`Payment history across ${projects.length} project${projects.length === 1 ? "" : "s"} — ${formatINRWhole(total)} received in total.`}
      />

      {projects.length > 0 && totalContractValue > 0 && (
        <section className="mb-6 rounded-lg border border-border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">
            Total project value across {projects.length} project{projects.length === 1 ? "" : "s"}
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
            {formatINRWhole(totalContractValue)}
          </p>
        </section>
      )}

      <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Payment history</h2>
        <ClientPaymentHistoryTable rows={rows} ops={ops} persist={persist} />
      </section>
    </div>
  );
}
