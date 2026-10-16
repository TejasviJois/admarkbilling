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
        <section className="mb-6 rounded-3xl border border-white/10 bg-[#141419]/80 p-5 shadow-xl backdrop-blur-2xl">
          <p className="text-xs font-medium uppercase tracking-wider text-white/50">
            Total project value across {projects.length} project{projects.length === 1 ? "" : "s"}
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-white">
            {formatINRWhole(totalContractValue)}
          </p>
        </section>
      )}

      <section className="rounded-3xl border border-white/10 bg-[#141419]/80 p-5 shadow-xl backdrop-blur-2xl sm:p-6">
        <h2 className="mb-4 text-base font-bold text-white">Payment history</h2>
        <ClientPaymentHistoryTable rows={rows} ops={ops} persist={persist} />
      </section>
    </div>
  );
}
