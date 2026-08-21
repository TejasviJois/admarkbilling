import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FolderOpen, Plus, Search } from "lucide-react";
import {
  ArchiveHubCard,
  HUB_ICONS,
  LibraryHubCard,
  RecentDocumentRow,
  documentOpenHref,
} from "@/components/documents/documents-ui";
import { OperationsLoading } from "@/components/operations/operations-ui";
import { useDocuments } from "@/hooks/use-documents";
import { useOperations } from "@/hooks/use-operations";
import {
  admarkVaultDocuments,
  clientFolders,
  preClientDocuments,
  vaultDocuments,
} from "@/lib/document-vault";

export const Route = createFileRoute("/documents/")({ component: DocumentsHubPage });

function DocumentsHubPage() {
  const { ops, loading: opsLoading } = useOperations();
  const { docs, loading: documentsLoading } = useDocuments();
  const [search, setSearch] = useState("");

  const preClient = useMemo(
    () => preClientDocuments(docs.archiveDocuments),
    [docs.archiveDocuments],
  );
  const clientFolderList = useMemo(
    () => clientFolders(docs.archiveDocuments, ops.clients ?? []),
    [docs.archiveDocuments, ops.clients],
  );
  const vault = useMemo(
    () => admarkVaultDocuments(docs.archiveDocuments),
    [docs.archiveDocuments],
  );

  const recent = useMemo(() => {
    const query = search.trim().toLowerCase();
    return vaultDocuments(docs.archiveDocuments)
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .filter((doc) => {
        if (!query) return true;
        const hay = `${doc.title} ${doc.companyName ?? ""} ${doc.clientName ?? ""} ${doc.fileName ?? ""}`.toLowerCase();
        return hay.includes(query);
      })
      .slice(0, 8);
  }, [docs.archiveDocuments, search]);

  if (opsLoading || documentsLoading) return <OperationsLoading />;

  const preClientCount = preClient.length;
  const clientFolderCount = clientFolderList.length;
  const vaultCount = vault.length;

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <FolderOpen className="h-6 w-6 shrink-0 text-primary" strokeWidth={1.75} />
            <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              Documents
            </h1>
          </div>
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
            Manage proposals, client documents, invoices and internal knowledge.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
          <div className="relative min-w-0 flex-1 sm:w-64 lg:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search documents…"
              className="h-10 w-full rounded-lg border border-border/80 bg-card/40 pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-border"
              aria-label="Search documents"
            />
          </div>
          <Link
            to="/documents/proposals"
            className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            New document
          </Link>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-foreground">Libraries</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <LibraryHubCard
            to="/documents/proposals"
            title="Proposals & quotations"
            description="Company folders before they become clients. Upload proposals and quotations here."
            accent="rose"
            icon={HUB_ICONS.proposals}
            stat={
              <>
                {preClientCount} document{preClientCount === 1 ? "" : "s"}
              </>
            }
          />
          <LibraryHubCard
            to="/documents/clients"
            title="Clients"
            description="Live client folders created when you press Proceed on a won company."
            accent="violet"
            icon={HUB_ICONS.clients}
            stat={
              <>
                {clientFolderCount} active client{clientFolderCount === 1 ? "" : "s"}
              </>
            }
          />
          <LibraryHubCard
            to="/documents/vault"
            title="Admark vault"
            description="Internal SOPs, company docs, and partnership drafts."
            accent="amber"
            icon={HUB_ICONS.vault}
            stat={
              <>
                {vaultCount} document{vaultCount === 1 ? "" : "s"}
              </>
            }
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium text-foreground">Recent documents</h2>
          <Link
            to="/documents/proposals"
            className="text-xs font-medium text-primary hover:text-primary/80"
          >
            View all →
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="border-y border-border/80 py-10 text-center text-sm text-muted-foreground">
            {search ? "No documents match your search." : "No documents yet. Upload your first file."}
          </p>
        ) : (
          <div className="divide-y divide-border/80 border-y border-border/80">
            {recent.map((document) => (
              <RecentDocumentRow
                key={document.id}
                document={document}
                href={documentOpenHref(document)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-foreground">Archive</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <ArchiveHubCard
            to="/documents/invoices"
            title="Invoices"
            description="Generated invoice downloads and payment archives."
            accent="sky"
            icon={HUB_ICONS.invoices}
            watermark={HUB_ICONS.invoiceWatermark}
          />
          <ArchiveHubCard
            to="/documents/agreements"
            title="Legacy agreements"
            description="Older contracts not yet filed in a client folder."
            accent="violet"
            icon={HUB_ICONS.agreements}
            watermark={HUB_ICONS.agreementWatermark}
          />
        </div>
      </section>
    </div>
  );
}
