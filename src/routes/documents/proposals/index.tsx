import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FolderOpen, Plus, Search } from "lucide-react";
import { PreClientLibraryView } from "@/components/documents/DocumentVault";
import { DocumentsBreadcrumb } from "@/components/documents/documents-ui";
import { OperationsLoading } from "@/components/operations/operations-ui";
import { useDocuments } from "@/hooks/use-documents";
import { logClientError } from "@/lib/client-logger";
import { groupByCompany, preClientDocuments } from "@/lib/document-vault";

export const Route = createFileRoute("/documents/proposals/")({
  component: DocumentsProposalsPage,
});

function DocumentsProposalsPage() {
  const { docs, loading, saving, persist } = useDocuments();
  const [search, setSearch] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);

  const folderCount = useMemo(() => {
    const grouped = groupByCompany(preClientDocuments(docs.archiveDocuments));
    const query = search.trim().toLowerCase();
    if (!query) return grouped.length;
    return grouped.filter((folder) => folder.companyName.toLowerCase().includes(query)).length;
  }, [docs.archiveDocuments, search]);

  if (loading) return <OperationsLoading />;

  return (
    <div className="space-y-8">
      <DocumentsBreadcrumb
        items={[{ label: "Documents", to: "/documents" }, { label: "Proposals & quotations" }]}
      />

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400">
              <FolderOpen className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              Proposals & quotations
            </h1>
          </div>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            One folder per company. When they win, open it and press Proceed.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
          <div className="relative min-w-0 flex-1 sm:w-64 lg:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search companies…"
              className="h-10 w-full rounded-lg border border-border/80 bg-card/40 pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-border"
              aria-label="Search companies"
            />
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
      </div>

      <PreClientLibraryView
        documents={docs}
        saving={saving}
        search={search}
        uploadOpen={uploadOpen}
        onUploadOpenChange={setUploadOpen}
        folderCountLabel={folderCount}
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
