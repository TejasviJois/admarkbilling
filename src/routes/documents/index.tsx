import { createFileRoute } from "@tanstack/react-router";
import { FileSignature, FileText, FolderKanban, Landmark } from "lucide-react";
import { DocumentHubCard } from "@/components/documents/documents-ui";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { useDocuments } from "@/hooks/use-documents";
import { useOperations } from "@/hooks/use-operations";
import { admarkVaultDocuments, clientFolders, preClientDocuments } from "@/lib/document-vault";

export const Route = createFileRoute("/documents/")({ component: DocumentsHubPage });

function DocumentsHubPage() {
  const { ops, loading: opsLoading } = useOperations();
  const { docs, loading: documentsLoading } = useDocuments();

  if (opsLoading || documentsLoading) return <OperationsLoading />;

  const preClientCount = preClientDocuments(docs.archiveDocuments).length;
  const clientFolderCount = clientFolders(docs.archiveDocuments, ops.clients ?? []).length;
  const vaultCount = admarkVaultDocuments(docs.archiveDocuments).length;

  return (
    <div>
      <OperationsPageHeader
        title="Documents"
        description="Keep a company’s proposal and quotation in one folder. When they win, proceed to create their client folder. Admark vault is for SOPs and company documentation."
      />

      <div className="grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-3">
        <DocumentHubCard
          to="/documents/proposals"
          title="Proposals & quotations"
          description="One folder per company. Add the proposal first, then the quotation — no client profile needed."
          stat={`${preClientCount} file${preClientCount === 1 ? "" : "s"}`}
          icon={<FileText className="h-6 w-6" />}
        />
        <DocumentHubCard
          to="/documents/clients"
          title="Clients"
          description="Created when you press Proceed — not when a lead is marked Won."
          stat={`${clientFolderCount} folder${clientFolderCount === 1 ? "" : "s"}`}
          icon={<FolderKanban className="h-6 w-6" />}
        />
        <DocumentHubCard
          to="/documents/vault"
          title="Admark vault"
          description="SOPs, company documentation, and partnership agreement drafts."
          stat={`${vaultCount} file${vaultCount === 1 ? "" : "s"}`}
          icon={<Landmark className="h-6 w-6" />}
        />
      </div>

      <p className="mt-8 mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Other archives
      </p>
      <div className="grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-3">
        <DocumentHubCard
          to="/documents/invoices"
          title="Invoices"
          description="Generated invoices stay in Finance. This is the download archive."
          icon={<FileText className="h-6 w-6" />}
        />
        <DocumentHubCard
          to="/documents/agreements"
          title="Legacy agreements"
          description="Older contract uploads that are not yet in a client folder."
          icon={<FileSignature className="h-6 w-6" />}
        />
      </div>
    </div>
  );
}
