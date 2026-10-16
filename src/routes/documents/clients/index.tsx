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
          <div className="flex items-center gap-3">
            <span className="h-6 w-1.5 shrink-0 rounded-full bg-gradient-to-b from-[#ff6b2b] to-[#f04400] shadow-[0_0_12px_#ff6b2b]" />
            <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
              Clients
            </h1>
          </div>
          <p className="mt-1.5 max-w-xl text-xs text-white/50 md:text-sm">
            Live client folders created when you press Proceed on a won company.
          </p>
        </div>
        <div className="relative w-full sm:max-w-xs lg:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search client folders…"
            className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-9 pr-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-[#ff6b2b]/50 focus:ring-1 focus:ring-[#ff6b2b]/20 transition-all"
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
