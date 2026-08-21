import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search, Users } from "lucide-react";
import { ClientFoldersView } from "@/components/documents/DocumentVault";
import { DocumentsBreadcrumb } from "@/components/documents/documents-ui";
import { OperationsLoading } from "@/components/operations/operations-ui";
import { useDocuments } from "@/hooks/use-documents";
import { useOperations } from "@/hooks/use-operations";
import { clientFolders } from "@/lib/document-vault";

export const Route = createFileRoute("/documents/clients/")({
  component: DocumentClientFoldersPage,
});

function DocumentClientFoldersPage() {
  const { ops, loading: opsLoading } = useOperations();
  const { docs, loading: documentsLoading } = useDocuments();
  const [search, setSearch] = useState("");

  const folderCount = useMemo(() => {
    const query = search.trim().toLowerCase();
    return clientFolders(docs.archiveDocuments, ops.clients ?? []).filter((folder) =>
      query ? folder.name.toLowerCase().includes(query) : true,
    ).length;
  }, [docs.archiveDocuments, ops.clients, search]);

  if (opsLoading || documentsLoading) return <OperationsLoading />;

  return (
    <div className="space-y-8">
      <DocumentsBreadcrumb
        items={[{ label: "Documents", to: "/documents" }, { label: "Clients" }]}
      />

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
              <Users className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              Clients
            </h1>
          </div>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Live client folders created when you press Proceed on a won company.
          </p>
        </div>
        <div className="relative w-full sm:max-w-xs lg:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search client folders…"
            className="h-10 w-full rounded-lg border border-border/80 bg-card/40 pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-border"
            aria-label="Search client folders"
          />
        </div>
      </div>

      <ClientFoldersView
        documents={docs}
        clients={ops.clients ?? []}
        search={search}
        folderCountLabel={folderCount}
      />
    </div>
  );
}
