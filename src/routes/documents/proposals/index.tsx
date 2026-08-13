import { createFileRoute } from "@tanstack/react-router";
import { PreClientLibraryView } from "@/components/documents/DocumentVault";
import { DocumentsBreadcrumb } from "@/components/documents/documents-ui";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { useDocuments } from "@/hooks/use-documents";
import { logClientError } from "@/lib/client-logger";

export const Route = createFileRoute("/documents/proposals/")({
  component: DocumentsProposalsPage,
});

function DocumentsProposalsPage() {
  const { docs, loading, saving, persist } = useDocuments();
  if (loading) return <OperationsLoading />;

  return (
    <div>
      <DocumentsBreadcrumb
        items={[{ label: "Documents", to: "/documents" }, { label: "Proposals & quotations" }]}
      />
      <OperationsPageHeader
        title="Proposals & quotations"
        description="One folder per company. Upload the proposal, then the quotation. When they win, open the folder and press Proceed."
      />
      <PreClientLibraryView
        documents={docs}
        saving={saving}
        onChange={async (next, options) => {
          try {
            await persist(next, options);
          } catch (error) {
            logClientError("documents.proposals.save", error);
            throw error;
          }
        }}
      />
    </div>
  );
}
