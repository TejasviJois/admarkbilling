import { createFileRoute } from "@tanstack/react-router";
import { Archive } from "lucide-react";
import { AgreementsPanel } from "@/components/documents/AgreementsPanel";
import { DocumentsBreadcrumb } from "@/components/documents/documents-ui";
import { OperationsLoading } from "@/components/operations/operations-ui";
import { useDocuments } from "@/hooks/use-documents";
import { logClientError } from "@/lib/client-logger";

export const Route = createFileRoute("/documents/agreements")({
  component: DocumentsAgreementsPage,
});

function DocumentsAgreementsPage() {
  const { docs, loading, saving, saveAgreements } = useDocuments();

  if (loading) return <OperationsLoading />;

  return (
    <div className="space-y-8">
      <DocumentsBreadcrumb
        items={[{ label: "Documents", to: "/documents" }, { label: "Legacy agreements" }]}
      />

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
              <Archive className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              Legacy agreements
            </h1>
          </div>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Older contracts not yet filed in a client folder.
            {saving ? " · Saving…" : ""}
          </p>
        </div>
      </div>

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
    </div>
  );
}
