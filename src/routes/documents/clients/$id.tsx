import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, CalendarDays, FolderOpen, Plus, Users } from "lucide-react";
import { ClientFolderView } from "@/components/documents/DocumentVault";
import { DocumentsBreadcrumb } from "@/components/documents/documents-ui";
import { OperationsLoading } from "@/components/operations/operations-ui";
import { useCompany } from "@/hooks/use-company";
import { useDocuments } from "@/hooks/use-documents";
import { useOperations } from "@/hooks/use-operations";
import { activeMembers, documentsForClient } from "@/lib/document-vault";

export const Route = createFileRoute("/documents/clients/$id")({
  component: DocumentClientFolderPage,
});

function formatClientSince(ymd: string | undefined): string {
  if (!ymd) return "—";
  const [y, m] = ymd.split("-").map(Number);
  if (!y || !m) return ymd;
  return new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric" }).format(
    new Date(y, m - 1, 1),
  );
}

function DocumentClientFolderPage() {
  const { id } = Route.useParams();
  const { ops, loading: opsLoading } = useOperations();
  const { docs, loading: documentsLoading, saving, persist } = useDocuments();
  const { company } = useCompany();
  const [uploadOpen, setUploadOpen] = useState(false);

  const client = useMemo(
    () => (ops.clients ?? []).find((item) => item.id === id),
    [ops.clients, id],
  );
  const files = useMemo(
    () => documentsForClient(docs.archiveDocuments, id),
    [docs.archiveDocuments, id],
  );
  const members = useMemo(() => activeMembers(company.companyMembers), [company.companyMembers]);

  if (opsLoading || documentsLoading) return <OperationsLoading />;

  const title =
    client?.companyName || files[0]?.companyName || "Client folder";

  return (
    <div className="space-y-8">
      <DocumentsBreadcrumb
        items={[
          { label: "Documents", to: "/documents" },
          { label: "Clients", to: "/documents/clients" },
          { label: title },
        ]}
      />

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400">
              <Building2 className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              {title}
            </h1>
          </div>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Uploaded files and assets in this workspace.
          </p>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              Client since: {formatClientSince(client?.clientSince)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <FolderOpen className="h-3.5 w-3.5" />
              Total files: {files.length}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Team members: {members.length}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Upload
        </button>
      </div>

      <ClientFolderView
        clientId={id}
        documents={docs}
        ops={ops}
        saving={saving}
        uploadOpen={uploadOpen}
        onUploadOpenChange={setUploadOpen}
        onChange={persist}
      />
    </div>
  );
}
