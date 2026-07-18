import { createFileRoute } from "@tanstack/react-router";
import { DocumentArchive } from "@/components/documents/DocumentArchive";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { useDocuments } from "@/hooks/use-documents";
import { useInvoices } from "@/hooks/use-invoices";
import { useOperations } from "@/hooks/use-operations";
import { logClientError } from "@/lib/client-logger";

export const Route = createFileRoute("/documents/")({ component: DocumentsHubPage });

function DocumentsHubPage() {
  const { ops, loading: opsLoading } = useOperations();
  const { invoices, loading: invoicesLoading } = useInvoices();
  const { docs, loading: documentsLoading, saving, persist } = useDocuments();

  if (opsLoading || invoicesLoading || documentsLoading) return <OperationsLoading />;

  return (
    <div>
      <OperationsPageHeader
        title="Documents"
        description="Invoices and uploaded company documents in one searchable archive."
      />
      <DocumentArchive
        invoices={invoices}
        documents={docs}
        clients={ops.clients ?? []}
        saving={saving}
        onChange={async (next, options) => {
          try {
            await persist(next, options);
          } catch (error) {
            logClientError("documents.archive.save", error);
            alert(error instanceof Error ? error.message : "Could not save documents.");
            throw error;
          }
        }}
      />
    </div>
  );
}
