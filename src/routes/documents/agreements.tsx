import { createFileRoute } from "@tanstack/react-router";
import { AgreementsPanel } from "@/components/documents/AgreementsPanel";
import { DocumentsBreadcrumb } from "@/components/documents/documents-ui";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { useDocuments } from "@/hooks/use-documents";
import { logClientError } from "@/lib/client-logger";

export const Route = createFileRoute("/documents/agreements")({
  component: DocumentsAgreementsPage,
});

function DocumentsAgreementsPage() {
  const { docs, loading, saving, saveAgreements } = useDocuments();

  if (loading) return <OperationsLoading />;

  return (
    <div>
      <DocumentsBreadcrumb
        items={[{ label: "Documents", to: "/documents" }, { label: "Agreements" }]}
      />
      <OperationsPageHeader
        title="Agreements"
        description="Contracts, MOUs, and NDAs with clients, partners, and vendors — uploaded files sync to Supabase."
        action={saving ? <span className="text-xs text-muted-foreground">Saving…</span> : undefined}
      />

      <section className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6">
        <AgreementsPanel
          agreements={docs.agreements}
          saving={saving}
          onChange={async (next, options) => {
            try {
              await saveAgreements(next, options);
            } catch (e) {
              logClientError("documents.agreements.save", e);
              alert(e instanceof Error ? e.message : "Could not save agreements.");
            }
          }}
        />
      </section>
    </div>
  );
}
