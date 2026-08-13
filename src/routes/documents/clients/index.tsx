import { createFileRoute } from "@tanstack/react-router";
import { ClientFoldersView } from "@/components/documents/DocumentVault";
import { DocumentsBreadcrumb } from "@/components/documents/documents-ui";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { useDocuments } from "@/hooks/use-documents";
import { useOperations } from "@/hooks/use-operations";

export const Route = createFileRoute("/documents/clients/")({
  component: DocumentClientFoldersPage,
});

function DocumentClientFoldersPage() {
  const { ops, loading: opsLoading } = useOperations();
  const { docs, loading: documentsLoading } = useDocuments();

  if (opsLoading || documentsLoading) return <OperationsLoading />;

  return (
    <div>
      <DocumentsBreadcrumb
        items={[{ label: "Documents", to: "/documents" }, { label: "Clients" }]}
      />
      <OperationsPageHeader
        title="Clients"
        description="Folders created when you Proceed on a won proposal or quotation. Upload files inside each company."
      />
      <ClientFoldersView documents={docs} clients={ops.clients ?? []} />
    </div>
  );
}
