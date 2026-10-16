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
    <div className="space-y-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#ff6b2b]/15 text-[#ff6b2b] border border-[#ff6b2b]/30 shadow-[0_0_12px_rgba(255,107,43,0.2)]">
              <FolderOpen className="h-5 w-5" strokeWidth={2} />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
              Documents Vault
            </h1>
          </div>
          <p className="mt-1.5 max-w-xl text-xs text-white/50">
            Manage proposals, client contracts, compliance files, generated invoices and internal knowledge assets.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2.5 sm:flex-row sm:items-center lg:w-auto">
          <div className="relative min-w-0 flex-1 sm:w-64 lg:w-72">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search documents…"
              className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-10 pr-3.5 text-xs text-white outline-none placeholder:text-white/40 focus:border-[#ff6b2b]/50 focus:ring-1 focus:ring-[#ff6b2b] transition-all"
              aria-label="Search documents"
            />
          </div>
          <Link
            to="/documents/proposals"
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#ff6b2b] to-[#f04400] px-4 text-xs font-semibold text-white shadow-lg shadow-[#ff6b2b]/25 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            New Document
          </Link>
        </div>
      </div>

      <section className="space-y-3.5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-white/40">Active Libraries</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <LibraryHubCard
            to="/documents/proposals"
            title="Proposals & Quotations"
            description="Company folders before they become clients. Upload proposals, briefs, and quotations here."
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
            title="Client Documents"
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
            title="Admark Vault"
            description="Internal SOPs, company docs, master agreements, and partnership drafts."
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

      <section className="space-y-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white/40">Recent Activity & Documents</h2>
          <Link
            to="/documents/proposals"
            className="text-xs font-semibold text-[#ff6b2b] hover:underline"
          >
            View all proposals →
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="glass-panel rounded-2xl border border-dashed border-white/10 py-12 text-center text-sm text-white/40">
            {search ? "No documents match your search query." : "No documents recorded yet. Upload your first file."}
          </div>
        ) : (
          <div className="glass-panel rounded-2xl border border-white/10 overflow-hidden divide-y divide-white/10 shadow-xl">
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

      <section className="space-y-3.5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-white/40">System Archive</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ArchiveHubCard
            to="/documents/invoices"
            title="Invoices Archive"
            description="Generated tax invoice downloads, PDF records, and settlement receipts."
            accent="sky"
            icon={HUB_ICONS.invoices}
            watermark={HUB_ICONS.invoiceWatermark}
          />
          <ArchiveHubCard
            to="/documents/agreements"
            title="Legacy Agreements"
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
