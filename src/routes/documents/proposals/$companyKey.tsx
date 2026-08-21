import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, FileText, FolderOpen } from "lucide-react";
import { PreClientCompanyView } from "@/components/documents/DocumentVault";
import { DocumentsBreadcrumb, formatRelativeUpdated } from "@/components/documents/documents-ui";
import { OperationsLoading } from "@/components/operations/operations-ui";
import { useDocuments } from "@/hooks/use-documents";
import { useOperations } from "@/hooks/use-operations";
import { logClientError } from "@/lib/client-logger";
import { decodeEntitySlug } from "@/lib/document-slug";
import { documentsForCompany } from "@/lib/document-vault";

export const Route = createFileRoute("/documents/proposals/$companyKey")({
  component: DocumentsProposalCompanyPage,
});

function DocumentsProposalCompanyPage() {
  const { companyKey } = Route.useParams();
  const companyName = decodeEntitySlug(companyKey);
  const { docs, loading: documentsLoading, saving, persist } = useDocuments();
  const { ops, persist: persistOps, loading: opsLoading } = useOperations();

  const files = useMemo(
    () => documentsForCompany(docs.archiveDocuments, companyName),
    [docs.archiveDocuments, companyName],
  );
  const latestUpdated = files[0]?.updatedAt;
  const updatedLabel = latestUpdated
    ? formatRelativeUpdated(latestUpdated).long
    : "No files yet";

  if (opsLoading || documentsLoading) return <OperationsLoading />;

  return (
    <div className="space-y-8">
      <DocumentsBreadcrumb
        items={[
          { label: "Documents", to: "/documents" },
          { label: "Proposals & quotations", to: "/documents/proposals" },
          { label: companyName },
        ]}
      />

      <div>
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400">
            <Building2 className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {companyName}
          </h1>
        </div>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Proposal and quotation files. Proceed moves them into a client folder.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <FolderOpen className="h-3.5 w-3.5" />
            Total files: {files.length}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            {updatedLabel}
          </span>
        </div>
      </div>

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
