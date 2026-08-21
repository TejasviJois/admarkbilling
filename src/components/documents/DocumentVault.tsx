import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Download, ExternalLink, FileText, Plus, Search, Trash2, Upload } from "lucide-react";
import {
  CompanyFolderRow,
  DocumentFileCard,
  FolderPagination,
  FolderViewToggle,
} from "@/components/documents/documents-ui";
import { fileFromUpload } from "@/components/documents/proof-ui";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/hooks/use-company";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { logClientError } from "@/lib/client-logger";
import {
  ADMARK_VAULT_COMPANY,
  activeMembers,
  admarkVaultDocuments,
  assigneeNames,
  clientFolders,
  documentsForClient,
  documentsForCompany,
  documentTypeLabel,
  ensureClientForCompany,
  groupByCompany,
  newArchiveDocumentId,
  preClientDocuments,
  proceedCompanyToClient,
} from "@/lib/document-vault";
import type { DocumentsPersistOptions } from "@/lib/documents-storage";
import { decodeEntitySlug } from "@/lib/document-slug";
import { safeHref } from "@/lib/utils";
import type {
  ArchiveDocument,
  ArchiveDocumentType,
  Client,
  CompanyMember,
  DocumentLibrary,
  DocumentsData,
  OperationsData,
} from "@/lib/types";

const FILE_ACCEPT =
  ".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*";
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const LIST_ROWS = "divide-y divide-border/80 border-y border-border/80";

type UploadInput = {
  title: string;
  companyName: string;
  documentType: ArchiveDocumentType;
  assignedMemberIds?: string[];
  file?: File;
  externalUrl?: string;
};

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function memberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function approxFileSizeLabel(document: ArchiveDocument): string | undefined {
  const data = document.fileDataUrl;
  if (!data) return document.externalUrl ? "Link" : undefined;
  const base64 = data.includes(",") ? data.split(",")[1] : data;
  if (!base64) return undefined;
  const bytes = Math.floor((base64.length * 3) / 4);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MemberChips({
  members,
  selectedIds,
  onToggle,
}: {
  members: CompanyMember[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  if (members.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {members.map((member) => {
        const isOn = selectedIds.includes(member.id);
        return (
          <button
            key={member.id}
            type="button"
            aria-pressed={isOn}
            onClick={() => onToggle(member.id)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              isOn
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
          >
            {firstName(member.name)}
          </button>
        );
      })}
    </div>
  );
}

function isImageDocument(document: ArchiveDocument): boolean {
  const mime = document.mimeType?.toLowerCase() ?? "";
  const name = document.fileName?.toLowerCase() ?? "";
  const src = document.fileDataUrl ?? document.externalUrl ?? "";
  return (
    mime.startsWith("image/") ||
    src.startsWith("data:image/") ||
    /\.(png|jpe?g|webp|gif|bmp)$/i.test(name) ||
    /\.(png|jpe?g|webp|gif|bmp)(\?|$)/i.test(src)
  );
}

function isPdfDocument(document: ArchiveDocument): boolean {
  const mime = document.mimeType?.toLowerCase() ?? "";
  const name = document.fileName?.toLowerCase() ?? "";
  const src = document.fileDataUrl ?? document.externalUrl ?? "";
  return (
    mime.includes("pdf") ||
    src.startsWith("data:application/pdf") ||
    /\.pdf(\?|$)/i.test(name + src)
  );
}

function previewSrc(document: ArchiveDocument): string | undefined {
  return document.fileDataUrl || safeHref(document.externalUrl);
}

async function persistArchive(
  documents: DocumentsData,
  archiveDocuments: ArchiveDocument[],
  onChange: (next: DocumentsData, options?: DocumentsPersistOptions) => Promise<void>,
  deleteIds?: string[],
) {
  await onChange(
    { ...documents, archiveDocuments },
    deleteIds?.length ? { deleteIds: { archiveDocuments: deleteIds } } : undefined,
  );
}

function DocumentPreviewDialog({
  document,
  members,
  onClose,
  onAssign,
}: {
  document: ArchiveDocument | null;
  members?: CompanyMember[];
  onClose: () => void;
  onAssign?: (ids: string[]) => void;
}) {
  const isMobile = useIsMobile();
  const src = document ? previewSrc(document) : undefined;
  const image = document ? isImageDocument(document) : false;
  const pdf = document ? isPdfDocument(document) : false;
  const assigned = document?.assignedMemberIds ?? [];
  const names = members ? assigneeNames(assigned, members) : [];
  const fileLabel = document?.fileName || "document";

  return (
    <Dialog open={document != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[min(92vh,900px)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="pr-6">{document?.title ?? "Document"}</DialogTitle>
          <DialogDescription>
            {[document?.fileName, names.length ? `Assigned: ${names.join(", ")}` : null]
              .filter(Boolean)
              .join(" · ") || "Document preview"}
          </DialogDescription>
        </DialogHeader>
        {members && members.length > 0 && onAssign && document ? (
          <div>
            <p className="mb-1.5 text-xs text-muted-foreground">Assigned to</p>
            <MemberChips
              members={members}
              selectedIds={assigned}
              onToggle={(id) =>
                onAssign(
                  assigned.includes(id)
                    ? assigned.filter((item) => item !== id)
                    : [...assigned, id],
                )
              }
            />
          </div>
        ) : null}
        {src && image ? (
          <div className="overflow-auto rounded-lg border border-border bg-muted/20 p-2">
            <img
              src={src}
              alt={document?.title ?? "Document preview"}
              className="mx-auto max-h-[min(70vh,640px)] w-full object-contain"
            />
          </div>
        ) : src && pdf && isMobile ? (
          <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-6 text-center">
            <FileText className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">
              Phone browsers can’t scroll PDFs inside this popup. Open it in a new tab to view every
              page and download.
            </p>
          </div>
        ) : src && pdf ? (
          <iframe
            title={document?.title ?? "PDF preview"}
            src={src}
            className="h-[min(70vh,640px)] w-full rounded-lg border border-border bg-muted/20"
          />
        ) : src ? (
          <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              This file type can’t be previewed here. Download it to open.
            </p>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">No file attached.</p>
        )}
        {src ? (
          <DialogFooter className="gap-2 sm:gap-2">
            {(pdf || !image) && (
              <Button type="button" variant="outline" asChild>
                <a href={src} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-1.5 h-4 w-4" />
                  Open in new tab
                </a>
              </Button>
            )}
            <Button type="button" variant="outline" asChild>
              <a href={src} download={fileLabel}>
                <Download className="mr-1.5 h-4 w-4" />
                Download
              </a>
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DocumentTile({
  document,
  assigneeLabel,
  onOpen,
  onRemove,
}: {
  document: ArchiveDocument;
  assigneeLabel?: string;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const thumb = isImageDocument(document) ? previewSrc(document) : undefined;
  const meta = assigneeLabel || document.fileName || undefined;

  return (
    <div className="group flex items-center gap-3 py-3">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left transition-colors"
      >
        {thumb ? (
          <img src={thumb} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <FileText className="h-4 w-4" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{document.title}</span>
          {meta ? (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{meta}</span>
          ) : null}
        </span>
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-rose-500/10 hover:text-rose-400 group-hover:opacity-100"
        title="Remove document"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function UploadForm({
  open,
  onOpenChange,
  library,
  documentType,
  companyNameLocked,
  members,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  library: DocumentLibrary;
  documentType: ArchiveDocumentType;
  companyNameLocked?: string;
  members?: CompanyMember[];
  onSave: (input: UploadInput) => Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [companyName, setCompanyName] = useState(companyNameLocked ?? "");
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [externalUrl, setExternalUrl] = useState("");
  const [assignedMemberIds, setAssignedMemberIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setCompanyName(companyNameLocked ?? "");
    setPickedFile(null);
    setExternalUrl("");
    setAssignedMemberIds([]);
    setUploading(false);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [open, companyNameLocked]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (uploading) return;
    if (!title.trim()) {
      setError("Enter a document title.");
      return;
    }
    if (!companyNameLocked && !companyName.trim()) {
      setError("Enter the company name.");
      return;
    }
    if (!pickedFile && !externalUrl.trim()) {
      setError("Choose a file or paste a link.");
      return;
    }
    if (pickedFile && pickedFile.size > MAX_FILE_BYTES) {
      setError("File too large (max 15MB). Compress the PDF, or paste a Drive/Dropbox link below.");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      await onSave({
        title: title.trim(),
        companyName: (companyNameLocked ?? companyName).trim(),
        documentType,
        assignedMemberIds: assignedMemberIds.length > 0 ? assignedMemberIds : undefined,
        file: pickedFile ?? undefined,
        externalUrl: externalUrl.trim() || undefined,
      });
      onOpenChange(false);
    } catch (caught) {
      logClientError("documents.vault.upload", caught);
      setError(caught instanceof Error ? caught.message : "Could not upload document.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto p-0 sm:max-w-md">
        <DialogHeader className="border-b border-border/80 px-5 py-4 text-left">
          <DialogTitle className="text-base font-semibold tracking-tight">Upload document</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            PDF, Word, image, or paste a link.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="space-y-4 px-5 py-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Title</span>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={
                library === "vault"
                  ? "e.g. SOP, partnership draft"
                  : library === "client"
                    ? "e.g. Agreement, handover"
                    : "e.g. Proposal, quotation"
              }
              className="h-9 border-border/80"
              autoFocus
            />
          </label>
          {!companyNameLocked && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Company name
              </span>
              <Input
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder="e.g. Motorola"
                className="h-9 border-border/80"
              />
            </label>
          )}
          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">File</span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-9 w-full items-center gap-2 rounded-md border border-dashed border-border/80 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
            >
              <Upload className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{pickedFile?.name ?? "Choose file (max 15MB)"}</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={FILE_ACCEPT}
              className="hidden"
              onChange={(event) => setPickedFile(event.target.files?.[0] ?? null)}
            />
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Or paste a link
            </span>
            <Input
              value={externalUrl}
              onChange={(event) => setExternalUrl(event.target.value)}
              placeholder="https://…"
              className="h-9 border-border/80"
            />
          </label>
          {members && members.length > 0 ? (
            <div>
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Assign to
              </span>
              <MemberChips
                members={members}
                selectedIds={assignedMemberIds}
                onToggle={(id) =>
                  setAssignedMemberIds((current) =>
                    current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
                  )
                }
              />
            </div>
          ) : null}
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <DialogFooter className="gap-2 border-t border-border/80 pt-4 sm:justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-border/80"
              onClick={() => onOpenChange(false)}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={uploading}>
              {uploading ? "Uploading…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PreClientLibraryView({
  documents,
  onChange,
  search: searchProp,
  uploadOpen: uploadOpenProp,
  onUploadOpenChange,
  folderCountLabel,
}: {
  documents: DocumentsData;
  saving?: boolean;
  onChange: (next: DocumentsData, options?: DocumentsPersistOptions) => Promise<void>;
  /** When provided with onUploadOpenChange, parent owns the toolbar. */
  search?: string;
  uploadOpen?: boolean;
  onUploadOpenChange?: (open: boolean) => void;
  folderCountLabel?: number;
}) {
  const [searchLocal, setSearchLocal] = useState("");
  const [uploadOpenLocal, setUploadOpenLocal] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);
  /** Grid: 3 rows × 5 cols. List: denser page. Paginate only when overflow. */
  const pageSize = view === "grid" ? 15 : 16;
  const controlled = onUploadOpenChange != null;
  const search = controlled ? (searchProp ?? "") : searchLocal;
  const uploadOpen = controlled ? Boolean(uploadOpenProp) : uploadOpenLocal;
  const setUploadOpen = controlled
    ? (open: boolean) => onUploadOpenChange?.(open)
    : setUploadOpenLocal;

  const folders = useMemo(() => {
    const grouped = groupByCompany(preClientDocuments(documents.archiveDocuments));
    const query = search.trim().toLowerCase();
    const list = query
      ? grouped.filter((folder) => folder.companyName.toLowerCase().includes(query))
      : grouped;
    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [documents.archiveDocuments, search]);

  const pageCount = Math.max(1, Math.ceil(folders.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageFolders = folders.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [search, view]);

  const saveUpload = async (input: UploadInput) => {
    const id = newArchiveDocumentId();
    let uploaded: { fileDataUrl?: string; fileName?: string; mimeType?: string } = {};
    if (input.file) {
      uploaded = await fileFromUpload(input.file, `documents/archive/${id}`);
    }
    const now = Date.now();
    const next: ArchiveDocument = {
      id,
      title: input.title,
      documentType: "other",
      library: "preclient",
      companyName: input.companyName,
      clientName: input.companyName,
      ...uploaded,
      externalUrl: input.externalUrl,
      createdAt: now,
      updatedAt: now,
    };
    await persistArchive(documents, [next, ...(documents.archiveDocuments ?? [])], onChange);
    setUploadOpen(false);
  };

  const count = folderCountLabel ?? folders.length;

  return (
    <div className="space-y-6">
      {!controlled ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1 sm:max-w-xs lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchLocal}
              onChange={(event) => setSearchLocal(event.target.value)}
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
      ) : null}

      <UploadForm
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        library="preclient"
        documentType="other"
        onSave={saveUpload}
      />

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-foreground">Company folders</h2>
          <div className="flex items-center gap-3">
            <p className="text-xs text-muted-foreground">
              {count} compan{count === 1 ? "y" : "ies"}
            </p>
            <FolderViewToggle view={view} onChange={setView} />
          </div>
        </div>
        {folders.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/80 py-12 text-center text-sm text-muted-foreground">
            {search
              ? "No companies match your search."
              : "No files yet. Upload a proposal or quotation under the company name."}
          </p>
        ) : (
          <>
            <div
              className={
                view === "grid"
                  ? "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5"
                  : "flex flex-col gap-2"
              }
            >
              {pageFolders.map((folder) => (
                <CompanyFolderRow
                  key={folder.key}
                  to="/documents/proposals/$companyKey"
                  params={{ companyKey: folder.key }}
                  title={folder.companyName}
                  fileCount={folder.count}
                  updatedAt={folder.updatedAt}
                  layout={view}
                />
              ))}
            </div>
            <FolderPagination page={safePage} pageCount={pageCount} onPageChange={setPage} />
          </>
        )}
      </section>
    </div>
  );
}

export function PreClientCompanyView({
  companyKey,
  documents,
  ops,
  saving,
  onChange,
  persistOps,
}: {
  companyKey: string;
  documents: DocumentsData;
  ops: OperationsData;
  saving: boolean;
  onChange: (next: DocumentsData, options?: DocumentsPersistOptions) => Promise<void>;
  persistOps: (next: OperationsData) => Promise<void>;
}) {
  const navigate = useNavigate();
  const companyName = decodeEntitySlug(companyKey);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [proceeding, setProceeding] = useState(false);
  const [preview, setPreview] = useState<ArchiveDocument | null>(null);
  const [view, setView] = useState<"grid" | "list">("list");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const files = documentsForCompany(documents.archiveDocuments, companyName);

  const pageCount = Math.max(1, Math.ceil(files.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageFiles = files.slice((safePage - 1) * pageSize, safePage * pageSize);
  const rangeStart = files.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, files.length);

  useEffect(() => {
    setPage(1);
  }, [view, files.length]);

  const saveUpload = async (input: UploadInput) => {
    const id = newArchiveDocumentId();
    let uploaded: { fileDataUrl?: string; fileName?: string; mimeType?: string } = {};
    if (input.file) {
      uploaded = await fileFromUpload(input.file, `documents/archive/${id}`);
    }
    const now = Date.now();
    const next: ArchiveDocument = {
      id,
      title: input.title,
      documentType: "other",
      library: "preclient",
      companyName: input.companyName,
      clientName: input.companyName,
      ...uploaded,
      externalUrl: input.externalUrl,
      createdAt: now,
      updatedAt: now,
    };
    await persistArchive(documents, [next, ...(documents.archiveDocuments ?? [])], onChange);
    setUploadOpen(false);
  };

  const remove = async (document: ArchiveDocument) => {
    if (!confirm(`Remove "${document.title}"?`)) return;
    await persistArchive(
      documents,
      (documents.archiveDocuments ?? []).filter((item) => item.id !== document.id),
      onChange,
      [document.id],
    );
  };

  const proceed = async () => {
    if (files.length === 0) return alert("Upload at least one file first.");
    const existing = (ops.clients ?? []).find(
      (client) => client.companyName.trim().toLowerCase() === companyName.trim().toLowerCase(),
    );
    const ok = confirm(
      existing
        ? `${companyName} already has a client record. Move these proposal and quotation files into their client folder?`
        : `Create a client folder for ${companyName} and move these proposal and quotation files into it? You will still upload agreements yourself.`,
    );
    if (!ok) return;
    setProceeding(true);
    try {
      const { client, ops: nextOps } = ensureClientForCompany(ops, companyName);
      const moved = proceedCompanyToClient(documents.archiveDocuments ?? [], companyName, client);
      await persistOps(nextOps);
      await persistArchive(documents, moved, onChange);
      await navigate({ to: "/documents/clients/$id", params: { id: client.id } });
    } catch (error) {
      logClientError("documents.proceed", error);
      alert(error instanceof Error ? error.message : "Could not create the client folder.");
    } finally {
      setProceeding(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border/80 px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/40"
          >
            <Plus className="h-4 w-4" />
            Upload
          </button>
          <button
            type="button"
            onClick={() => void proceed()}
            disabled={proceeding || saving}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {proceeding ? "Moving…" : "Proceed"}
            {!proceeding ? <ArrowRight className="h-4 w-4" /> : null}
          </button>
        </div>
        <FolderViewToggle view={view} onChange={setView} />
      </div>

      <UploadForm
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        library="preclient"
        documentType="other"
        companyNameLocked={companyName}
        onSave={saveUpload}
      />

      {files.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/80 py-12 text-center text-sm text-muted-foreground">
          No files in this folder yet. Upload a proposal or quotation to get started.
        </p>
      ) : (
        <>
          <div
            className={
              view === "grid"
                ? "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5"
                : "divide-y divide-border/80 border-y border-border/80"
            }
          >
            {pageFiles.map((document) => (
              <DocumentFileCard
                key={document.id}
                title={document.title}
                updatedAt={document.updatedAt}
                accent="rose"
                layout={view}
                typeLabel={documentTypeLabel(document)}
                fileSizeLabel={approxFileSizeLabel(document)}
                onOpen={() => setPreview(document)}
                onRemove={() => void remove(document)}
              />
            ))}
          </div>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {rangeStart} – {rangeEnd} of {files.length} item{files.length === 1 ? "" : "s"}
            </p>
            <FolderPagination page={safePage} pageCount={pageCount} onPageChange={setPage} />
            <p className="text-xs text-muted-foreground">Items per page: {pageSize}</p>
          </div>
        </>
      )}
      <DocumentPreviewDialog document={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

export function ClientFoldersView({
  documents,
  clients,
  search: searchProp,
  folderCountLabel,
}: {
  documents: DocumentsData;
  clients: Client[];
  search?: string;
  folderCountLabel?: number;
}) {
  const [searchLocal, setSearchLocal] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);
  const pageSize = view === "grid" ? 15 : 16;
  const controlled = searchProp != null;
  const search = controlled ? searchProp : searchLocal;

  const folders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return clientFolders(documents.archiveDocuments, clients)
      .filter((folder) => (query ? folder.name.toLowerCase().includes(query) : true))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [clients, documents.archiveDocuments, search]);

  const pageCount = Math.max(1, Math.ceil(folders.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageFolders = folders.slice((safePage - 1) * pageSize, safePage * pageSize);
  const count = folderCountLabel ?? folders.length;

  useEffect(() => {
    setPage(1);
  }, [search, view]);

  return (
    <div className="space-y-6">
      {!controlled ? (
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchLocal}
            onChange={(event) => setSearchLocal(event.target.value)}
            placeholder="Search client folders…"
            className="h-10 w-full rounded-lg border border-border/80 bg-card/40 pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-border"
            aria-label="Search client folders"
          />
        </div>
      ) : null}

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-foreground">Client folders</h2>
          <div className="flex items-center gap-3">
            <p className="text-xs text-muted-foreground">
              {count} folder{count === 1 ? "" : "s"}
            </p>
            <FolderViewToggle view={view} onChange={setView} />
          </div>
        </div>
        {folders.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/80 py-12 text-center text-sm text-muted-foreground">
            {search
              ? "No folders match your search."
              : "No client folders yet. Open a company folder and press Proceed when won."}
          </p>
        ) : (
          <>
            <div
              className={
                view === "grid"
                  ? "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5"
                  : "flex flex-col gap-2"
              }
            >
              {pageFolders.map((folder) => (
                <CompanyFolderRow
                  key={folder.clientId}
                  to="/documents/clients/$id"
                  params={{ id: folder.clientId }}
                  title={folder.name}
                  fileCount={folder.count}
                  updatedAt={folder.updatedAt}
                  layout={view}
                  accent="violet"
                />
              ))}
            </div>
            <FolderPagination page={safePage} pageCount={pageCount} onPageChange={setPage} />
          </>
        )}
      </section>
    </div>
  );
}

export function ClientFolderView({
  clientId,
  documents,
  ops,
  onChange,
  uploadOpen: uploadOpenProp,
  onUploadOpenChange,
}: {
  clientId: string;
  documents: DocumentsData;
  ops: OperationsData;
  saving?: boolean;
  onChange: (next: DocumentsData, options?: DocumentsPersistOptions) => Promise<void>;
  uploadOpen?: boolean;
  onUploadOpenChange?: (open: boolean) => void;
}) {
  const { company } = useCompany();
  const members = useMemo(() => activeMembers(company.companyMembers), [company.companyMembers]);
  const [uploadOpenLocal, setUploadOpenLocal] = useState(false);
  const [preview, setPreview] = useState<ArchiveDocument | null>(null);
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [view, setView] = useState<"grid" | "list">("list");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const controlledUpload = onUploadOpenChange != null;
  const uploadOpen = controlledUpload ? Boolean(uploadOpenProp) : uploadOpenLocal;
  const setUploadOpen = controlledUpload
    ? (open: boolean) => onUploadOpenChange?.(open)
    : setUploadOpenLocal;

  const client =
    (ops.clients ?? []).find((item) => item.id === clientId) ??
    ({
      id: clientId,
      companyName:
        documentsForClient(documents.archiveDocuments, clientId)[0]?.companyName || "Client",
      contactPerson: "",
      phone: "",
      email: "",
      billingAddress: "",
      clientSince: "",
      status: "active",
    } satisfies Client);
  const files = documentsForClient(documents.archiveDocuments, clientId);
  const visible = files.filter((document) => {
    if (assigneeFilter === "all") return true;
    const ids = document.assignedMemberIds ?? [];
    if (assigneeFilter === "unassigned") return ids.length === 0;
    return ids.includes(assigneeFilter);
  });

  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageFiles = visible.slice((safePage - 1) * pageSize, safePage * pageSize);
  const rangeStart = visible.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, visible.length);

  useEffect(() => {
    setPage(1);
  }, [assigneeFilter, view]);

  const remove = async (document: ArchiveDocument) => {
    if (!confirm(`Remove "${document.title}"?`)) return;
    await persistArchive(
      documents,
      (documents.archiveDocuments ?? []).filter((item) => item.id !== document.id),
      onChange,
      [document.id],
    );
  };

  const saveUpload = async (input: UploadInput) => {
    const id = newArchiveDocumentId();
    let uploaded: { fileDataUrl?: string; fileName?: string; mimeType?: string } = {};
    if (input.file) {
      uploaded = await fileFromUpload(input.file, `documents/archive/${id}`);
    }
    const now = Date.now();
    const next: ArchiveDocument = {
      id,
      title: input.title,
      documentType: "other",
      library: "client",
      companyName: client.companyName,
      clientId: client.id,
      clientName: client.companyName,
      assignedMemberIds: input.assignedMemberIds,
      ...uploaded,
      externalUrl: input.externalUrl,
      createdAt: now,
      updatedAt: now,
    };
    await persistArchive(documents, [next, ...(documents.archiveDocuments ?? [])], onChange);
    setUploadOpen(false);
  };

  const assignPreview = async (ids: string[]) => {
    if (!preview) return;
    const assignedMemberIds = ids.length > 0 ? ids : undefined;
    const nextDoc = { ...preview, assignedMemberIds, updatedAt: Date.now() };
    setPreview(nextDoc);
    await persistArchive(
      documents,
      (documents.archiveDocuments ?? []).map((item) => (item.id === preview.id ? nextDoc : item)),
      onChange,
    );
  };

  const filterOptions = [
    { id: "all", label: "Everyone" },
    { id: "unassigned", label: "Unassigned" },
    ...members.map((member) => ({ id: member.id, label: firstName(member.name) })),
  ] as const;

  return (
    <div className="space-y-6">
      {!controlledUpload ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Upload
          </button>
        </div>
      ) : null}

      <UploadForm
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        library="client"
        documentType="other"
        companyNameLocked={client.companyName}
        members={members}
        onSave={saveUpload}
      />

      <div className="flex flex-col gap-3 border-b border-border/80 sm:flex-row sm:items-end sm:justify-between">
        <div className="-mb-px flex gap-0.5 overflow-x-auto">
          {filterOptions.map((option) => {
            const active = assigneeFilter === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={active}
                onClick={() => setAssigneeFilter(option.id)}
                className={`shrink-0 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <div className="flex shrink-0 items-center gap-2 pb-2">
          <FolderViewToggle view={view} onChange={setView} />
        </div>
      </div>

      {files.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/80 py-12 text-center text-sm text-muted-foreground">
          No files yet. Upload, then assign who owns it.
        </p>
      ) : visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/80 py-12 text-center text-sm text-muted-foreground">
          No files for that filter.
        </p>
      ) : (
        <>
          <div
            className={
              view === "grid"
                ? "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5"
                : "divide-y divide-border/80 border-y border-border/80"
            }
          >
            {pageFiles.map((document) => {
              const names = assigneeNames(document.assignedMemberIds, members);
              const primary = names[0];
              return (
                <DocumentFileCard
                  key={document.id}
                  title={document.title}
                  updatedAt={document.updatedAt}
                  accent="rose"
                  layout={view}
                  typeLabel={documentTypeLabel(document)}
                  assigneeName={primary ? firstName(primary) : "Unassigned"}
                  assigneeInitials={primary ? memberInitials(primary) : "—"}
                  fileSizeLabel={approxFileSizeLabel(document)}
                  onOpen={() => setPreview(document)}
                  onRemove={() => void remove(document)}
                />
              );
            })}
          </div>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {rangeStart} – {rangeEnd} of {visible.length} item{visible.length === 1 ? "" : "s"}
            </p>
            <FolderPagination page={safePage} pageCount={pageCount} onPageChange={setPage} />
            <p className="text-xs text-muted-foreground">Items per page: {pageSize}</p>
          </div>
        </>
      )}
      <DocumentPreviewDialog
        document={preview}
        members={members}
        onClose={() => setPreview(null)}
        onAssign={(ids) => void assignPreview(ids)}
      />
    </div>
  );
}

export function AdmarkVaultView({
  documents,
  onChange,
  search: searchProp,
  uploadOpen: uploadOpenProp,
  onUploadOpenChange,
}: {
  documents: DocumentsData;
  saving?: boolean;
  onChange: (next: DocumentsData, options?: DocumentsPersistOptions) => Promise<void>;
  search?: string;
  uploadOpen?: boolean;
  onUploadOpenChange?: (open: boolean) => void;
}) {
  const [searchLocal, setSearchLocal] = useState("");
  const [uploadOpenLocal, setUploadOpenLocal] = useState(false);
  const [preview, setPreview] = useState<ArchiveDocument | null>(null);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);
  const pageSize = view === "grid" ? 15 : 16;
  const controlled = onUploadOpenChange != null;
  const search = controlled ? (searchProp ?? "") : searchLocal;
  const uploadOpen = controlled ? Boolean(uploadOpenProp) : uploadOpenLocal;
  const setUploadOpen = controlled
    ? (open: boolean) => onUploadOpenChange?.(open)
    : setUploadOpenLocal;

  const files = useMemo(() => {
    const query = search.trim().toLowerCase();
    return admarkVaultDocuments(documents.archiveDocuments).filter((doc) => {
      if (!query) return true;
      const hay = `${doc.title} ${doc.fileName ?? ""}`.toLowerCase();
      return hay.includes(query);
    });
  }, [documents.archiveDocuments, search]);

  const pageCount = Math.max(1, Math.ceil(files.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageFiles = files.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [search, view]);

  const remove = async (document: ArchiveDocument) => {
    if (!confirm(`Remove "${document.title}"?`)) return;
    await persistArchive(
      documents,
      (documents.archiveDocuments ?? []).filter((item) => item.id !== document.id),
      onChange,
      [document.id],
    );
  };

  const saveUpload = async (input: UploadInput) => {
    const id = newArchiveDocumentId();
    let uploaded: { fileDataUrl?: string; fileName?: string; mimeType?: string } = {};
    if (input.file) {
      uploaded = await fileFromUpload(input.file, `documents/archive/${id}`);
    }
    const now = Date.now();
    const next: ArchiveDocument = {
      id,
      title: input.title,
      documentType: "other",
      library: "vault",
      companyName: ADMARK_VAULT_COMPANY,
      clientName: ADMARK_VAULT_COMPANY,
      ...uploaded,
      externalUrl: input.externalUrl,
      createdAt: now,
      updatedAt: now,
    };
    await persistArchive(documents, [next, ...(documents.archiveDocuments ?? [])], onChange);
    setUploadOpen(false);
  };

  return (
    <div className="space-y-6">
      {!controlled ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchLocal}
              onChange={(event) => setSearchLocal(event.target.value)}
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
      ) : null}

      <UploadForm
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        library="vault"
        documentType="other"
        companyNameLocked={ADMARK_VAULT_COMPANY}
        onSave={saveUpload}
      />

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-foreground">Vault files</h2>
          <div className="flex items-center gap-3">
            <p className="text-xs text-muted-foreground">
              {files.length} file{files.length === 1 ? "" : "s"}
            </p>
            <FolderViewToggle view={view} onChange={setView} />
          </div>
        </div>
        {files.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/80 py-12 text-center text-sm text-muted-foreground">
            {search
              ? "No files match your search."
              : "No files yet. Upload SOPs, company docs, or partnership drafts."}
          </p>
        ) : (
          <>
            <div
              className={
                view === "grid"
                  ? "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5"
                  : "flex flex-col gap-2"
              }
            >
              {pageFiles.map((document) => (
                <DocumentFileCard
                  key={document.id}
                  title={document.title}
                  meta={document.fileName}
                  updatedAt={document.updatedAt}
                  accent="amber"
                  layout={view}
                  onOpen={() => setPreview(document)}
                  onRemove={() => void remove(document)}
                />
              ))}
            </div>
            <FolderPagination page={safePage} pageCount={pageCount} onPageChange={setPage} />
          </>
        )}
      </section>
      <DocumentPreviewDialog document={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
