import { createFileRoute } from "@tanstack/react-router";
import { AdmarkVaultView } from "@/components/documents/DocumentVault";
import { DocumentsBreadcrumb } from "@/components/documents/documents-ui";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { useDocuments } from "@/hooks/use-documents";
import { logClientError } from "@/lib/client-logger";

export const Route = createFileRoute("/documents/vault")({
  component: AdmarkVaultPage,
});

function AdmarkVaultPage() {
  const { docs, loading, saving, persist } = useDocuments();
  if (loading) return <OperationsLoading />;

  return (
    <div>
      <DocumentsBreadcrumb
        items={[{ label: "Documents", to: "/documents" }, { label: "Admark vault" }]}
      />
      <OperationsPageHeader
        title="Admark vault"
        description="Internal files only — SOPs, company documentation, partnership agreement drafts. Title each file yourself."
      />
      <AdmarkVaultView
        documents={docs}
        saving={saving}
        onChange={async (next, options) => {
          try {
            await persist(next, options);
          } catch (error) {
            logClientError("documents.vault.save", error);
            throw error;
          }
        }}
      />
    </div>
  );
}
