import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Landmark, Plus, Search } from "lucide-react";
import { AdmarkVaultView } from "@/components/documents/DocumentVault";
import { DocumentsBreadcrumb } from "@/components/documents/documents-ui";
import { OperationsLoading } from "@/components/operations/operations-ui";
import { useDocuments } from "@/hooks/use-documents";
import { logClientError } from "@/lib/client-logger";
import { admarkVaultDocuments } from "@/lib/document-vault";

export const Route = createFileRoute("/documents/vault")({
  component: AdmarkVaultPage,
});

function AdmarkVaultPage() {
  const { docs, loading, saving, persist } = useDocuments();
  const [search, setSearch] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);

  const fileCount = useMemo(() => {
    const query = search.trim().toLowerCase();
    return admarkVaultDocuments(docs.archiveDocuments).filter((doc) => {
      if (!query) return true;
      return `${doc.title} ${doc.fileName ?? ""}`.toLowerCase().includes(query);
    }).length;
  }, [docs.archiveDocuments, search]);

  if (loading) return <OperationsLoading />;

  return (
    <div className="space-y-8">
      <DocumentsBreadcrumb
        items={[{ label: "Documents", to: "/documents" }, { label: "Admark vault" }]}
      />

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
              <Landmark className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              Admark vault
            </h1>
          </div>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Internal SOPs, company docs, and partnership drafts.
            {fileCount > 0 ? ` · ${fileCount} file${fileCount === 1 ? "" : "s"}` : ""}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
          <div className="relative min-w-0 flex-1 sm:w-64 lg:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search vault…"
              className="h-10 w-full rounded-lg border border-border/80 bg-card/40 pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-border"
              aria-label="Search vault"
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

      <AdmarkVaultView
        documents={docs}
        saving={saving}
        search={search}
        uploadOpen={uploadOpen}
        onUploadOpenChange={setUploadOpen}
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
