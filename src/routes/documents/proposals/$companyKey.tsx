import { createFileRoute } from "@tanstack/react-router";
import { PreClientCompanyView } from "@/components/documents/DocumentVault";
import { DocumentsBreadcrumb } from "@/components/documents/documents-ui";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { useDocuments } from "@/hooks/use-documents";
import { useOperations } from "@/hooks/use-operations";
import { logClientError } from "@/lib/client-logger";
import { decodeEntitySlug } from "@/lib/document-slug";

export const Route = createFileRoute("/documents/proposals/$companyKey")({
  component: DocumentsProposalCompanyPage,
});

function DocumentsProposalCompanyPage() {
  const { companyKey } = Route.useParams();
  const companyName = decodeEntitySlug(companyKey);
  const { docs, loading: documentsLoading, saving, persist } = useDocuments();
  const { ops, persist: persistOps, loading: opsLoading } = useOperations();

  if (opsLoading || documentsLoading) return <OperationsLoading />;

  return (
    <div>
      <DocumentsBreadcrumb
        items={[
          { label: "Documents", to: "/documents" },
          { label: "Proposals & quotations", to: "/documents/proposals" },
          { label: companyName },
        ]}
      />
      <OperationsPageHeader
        title={companyName}
        description="Proposal and quotation files for this company. Proceed moves them into a client folder — it does not create agreements."
      />
      <PreClientCompanyView
        companyKey={companyKey}
        documents={docs}
        ops={ops}
        saving={saving}
        onChange={persist}
        persistOps={async (next) => {
          try {
            await persistOps(next);
          } catch (error) {
            logClientError("documents.proposals.proceed.client", error);
            throw error;
          }
        }}
      />
    </div>
  );
}
