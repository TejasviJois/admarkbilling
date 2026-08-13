import { createFileRoute } from "@tanstack/react-router";
import { ClientFolderView } from "@/components/documents/DocumentVault";
import { DocumentsBreadcrumb } from "@/components/documents/documents-ui";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { useDocuments } from "@/hooks/use-documents";
import { useOperations } from "@/hooks/use-operations";
import { documentsForClient } from "@/lib/document-vault";

export const Route = createFileRoute("/documents/clients/$id")({
  component: DocumentClientFolderPage,
});

function DocumentClientFolderPage() {
  const { id } = Route.useParams();
  const { ops, loading: opsLoading } = useOperations();
  const { docs, loading: documentsLoading, saving, persist } = useDocuments();

  if (opsLoading || documentsLoading) return <OperationsLoading />;

  const client = (ops.clients ?? []).find((item) => item.id === id);
  const title =
    client?.companyName ||
    documentsForClient(docs.archiveDocuments, id)[0]?.companyName ||
    "Client folder";

  return (
    <div>
      <DocumentsBreadcrumb
        items={[
          { label: "Documents", to: "/documents" },
          { label: "Clients", to: "/documents/clients" },
          { label: title },
        ]}
      />
      <OperationsPageHeader
        title={title}
        description="Title the file yourself. Assign it to a team member so you can see who owns it."
      />
      <ClientFolderView
        clientId={id}
        documents={docs}
        ops={ops}
        saving={saving}
        onChange={persist}
      />
    </div>
  );
}
