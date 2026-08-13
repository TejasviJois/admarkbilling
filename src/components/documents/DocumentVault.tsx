import { useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { FileText, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { FolderTile } from "@/components/documents/documents-ui";
import { fileFromUpload } from "@/components/documents/proof-ui";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/hooks/use-company";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
const TILE_GRID = "grid max-w-5xl grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5";

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
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
              isOn
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
            }`}
          >
            {firstName(member.name)}
          </button>
        );
      })}
    </div>
  );
}

function fileCountLabel(count: number): string {
  return `${count} file${count === 1 ? "" : "s"}`;
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
  const src = document ? previewSrc(document) : undefined;
  const image = document ? isImageDocument(document) : false;
  const pdf = document ? isPdfDocument(document) : false;
  const assigned = document?.assignedMemberIds ?? [];
  const names = members ? assigneeNames(assigned, members) : [];

  return (
    <Dialog open={document != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[min(92vh,900px)] overflow-hidden sm:max-w-3xl">
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
            <a
              href={src}
              download={document?.fileName || "document"}
              className="text-sm font-medium text-primary hover:underline"
            >
              Download {document?.fileName || "file"}
            </a>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">No file attached.</p>
        )}
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

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onOpen}
        className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card p-3 text-center shadow-sm transition-shadow hover:shadow-md"
      >
        {thumb ? (
          <img src={thumb} alt="" className="h-16 w-16 rounded-md object-cover" />
        ) : (
          <FileText className="h-8 w-8 shrink-0 text-primary" />
        )}
        <p className="line-clamp-2 w-full text-sm font-semibold">{document.title}</p>
        {assigneeLabel ? (
          <p className="line-clamp-1 w-full text-[11px] text-muted-foreground">{assigneeLabel}</p>
        ) : null}
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        className="absolute right-1.5 top-1.5 rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        title="Remove document"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function UploadForm({
  library,
  documentType,
  companyNameLocked,
  members,
  onCancel,
  onSave,
}: {
  library: DocumentLibrary;
  documentType: ArchiveDocumentType;
  companyNameLocked?: string;
  members?: CompanyMember[];
  onCancel: () => void;
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
    } catch (caught) {
      logClientError("documents.vault.upload", caught);
      setError(caught instanceof Error ? caught.message : "Could not upload document.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="rounded-lg border border-border bg-muted/20 p-4"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Upload document</h2>
        <button type="button" onClick={onCancel} aria-label="Close upload form">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
      <div className="grid gap-3">
        <label>
          <span className="mb-1 block text-xs text-muted-foreground">Title</span>
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={
              library === "vault"
                ? "e.g. SOP, partnership draft"
                : library === "client"
                  ? "e.g. Agreement, handover, write-off"
                  : "e.g. Proposal, quotation"
            }
          />
        </label>
        {!companyNameLocked && (
          <label>
            <span className="mb-1 block text-xs text-muted-foreground">Company name</span>
            <Input
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              placeholder="e.g. Motorola"
            />
          </label>
        )}
        <div>
          <span className="mb-1 block text-xs text-muted-foreground">File</span>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-9 w-full items-center gap-2 rounded-md border border-dashed border-input bg-background px-3 text-sm text-muted-foreground hover:bg-secondary"
          >
            <Upload className="h-4 w-4" />
            {pickedFile?.name ?? "Choose PDF, Word, or image (max 15MB)"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={FILE_ACCEPT}
            className="hidden"
            onChange={(event) => setPickedFile(event.target.files?.[0] ?? null)}
          />
        </div>
        <label>
          <span className="mb-1 block text-xs text-muted-foreground">Or paste a link</span>
          <Input
            value={externalUrl}
            onChange={(event) => setExternalUrl(event.target.value)}
            placeholder="https://…"
          />
        </label>
        {members && members.length > 0 ? (
          <div>
            <span className="mb-1 block text-xs text-muted-foreground">
              Assign to (accountability)
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
      </div>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      <div className="mt-4 flex gap-2">
        <Button type="submit" size="sm" disabled={uploading}>
          {uploading ? "Uploading…" : "Save document"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={uploading}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function PreClientLibraryView({
  documents,
  onChange,
}: {
  documents: DocumentsData;
  saving?: boolean;
  onChange: (next: DocumentsData, options?: DocumentsPersistOptions) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const folders = useMemo(() => {
    const grouped = groupByCompany(preClientDocuments(documents.archiveDocuments));
    const query = search.trim().toLowerCase();
    if (!query) return grouped;
    return grouped.filter((folder) => folder.companyName.toLowerCase().includes(query));
  }, [documents.archiveDocuments, search]);

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

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search companies…"
            className="pl-9"
            aria-label="Search companies"
          />
        </div>
        <Button type="button" size="sm" onClick={() => setUploadOpen(true)}>
          <Plus className="h-4 w-4" /> Upload file
        </Button>
      </div>

      {uploadOpen && (
        <UploadForm
          library="preclient"
          documentType="other"
          onCancel={() => setUploadOpen(false)}
          onSave={saveUpload}
        />
      )}

      {folders.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {search
            ? "No companies match your search."
            : "No files yet. Upload a proposal or quotation under the company name — no client profile needed."}
        </p>
      ) : (
        <div className={TILE_GRID}>
          {folders.map((folder) => (
            <FolderTile
              key={folder.key}
              to="/documents/proposals/$companyKey"
              params={{ companyKey: folder.key }}
              title={folder.companyName}
              subtitle={fileCountLabel(folder.count)}
            />
          ))}
        </div>
      )}
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
  const files = documentsForCompany(documents.archiveDocuments, companyName);

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setUploadOpen(true)}>
          <Plus className="h-4 w-4" /> Upload file
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => void proceed()}
          disabled={proceeding || saving}
        >
          {proceeding ? "Moving…" : "Proceed — create client folder"}
        </Button>
      </div>

      {uploadOpen && (
        <UploadForm
          library="preclient"
          documentType="other"
          companyNameLocked={companyName}
          onCancel={() => setUploadOpen(false)}
          onSave={saveUpload}
        />
      )}

      {files.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No files in this folder yet.
        </p>
      ) : (
        <div className={TILE_GRID}>
          {files.map((document) => (
            <DocumentTile
              key={document.id}
              document={document}
              onOpen={() => setPreview(document)}
              onRemove={() => void remove(document)}
            />
          ))}
        </div>
      )}
      <DocumentPreviewDialog document={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

export function ClientFoldersView({
  documents,
  clients,
}: {
  documents: DocumentsData;
  clients: Client[];
}) {
  const [search, setSearch] = useState("");
  const folders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return clientFolders(documents.archiveDocuments, clients).filter((folder) =>
      query ? folder.name.toLowerCase().includes(query) : true,
    );
  }, [clients, documents.archiveDocuments, search]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search client folders…"
          className="pl-9"
          aria-label="Search client folders"
        />
      </div>
      {folders.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {search
            ? "No folders match your search."
            : "No client folders yet. Open a quotation or proposal and press Proceed when that company is won."}
        </p>
      ) : (
        <div className={TILE_GRID}>
          {folders.map((folder) => (
            <FolderTile
              key={folder.clientId}
              to="/documents/clients/$id"
              params={{ id: folder.clientId }}
              title={folder.name}
              subtitle={fileCountLabel(folder.count)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ClientFolderView({
  clientId,
  documents,
  ops,
  onChange,
}: {
  clientId: string;
  documents: DocumentsData;
  ops: OperationsData;
  saving?: boolean;
  onChange: (next: DocumentsData, options?: DocumentsPersistOptions) => Promise<void>;
}) {
  const { company } = useCompany();
  const members = useMemo(() => activeMembers(company.companyMembers), [company.companyMembers]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [preview, setPreview] = useState<ArchiveDocument | null>(null);
  const [assigneeFilter, setAssigneeFilter] = useState("all");
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {members.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-muted-foreground">Assigned to</span>
            {(
              [
                { id: "all", label: "Everyone" },
                { id: "unassigned", label: "Unassigned" },
                ...members.map((member) => ({ id: member.id, label: firstName(member.name) })),
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={assigneeFilter === option.id}
                onClick={() => setAssigneeFilter(option.id)}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                  assigneeFilter === option.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        <Button type="button" size="sm" onClick={() => setUploadOpen(true)}>
          <Plus className="h-4 w-4" /> Upload file
        </Button>
      </div>

      {uploadOpen && (
        <UploadForm
          library="client"
          documentType="other"
          companyNameLocked={client.companyName}
          members={members}
          onCancel={() => setUploadOpen(false)}
          onSave={saveUpload}
        />
      )}

      {files.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No files yet. Upload with a title, then assign who owns it.
        </p>
      ) : visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No files for that person. Try Everyone, or assign someone on a file.
        </p>
      ) : (
        <div className={TILE_GRID}>
          {visible.map((document) => {
            const names = assigneeNames(document.assignedMemberIds, members).map(firstName);
            return (
              <DocumentTile
                key={document.id}
                document={document}
                assigneeLabel={names.length ? names.join(", ") : "Unassigned"}
                onOpen={() => setPreview(document)}
                onRemove={() => void remove(document)}
              />
            );
          })}
        </div>
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
}: {
  documents: DocumentsData;
  saving?: boolean;
  onChange: (next: DocumentsData, options?: DocumentsPersistOptions) => Promise<void>;
}) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [preview, setPreview] = useState<ArchiveDocument | null>(null);
  const files = admarkVaultDocuments(documents.archiveDocuments);

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
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={() => setUploadOpen(true)}>
          <Plus className="h-4 w-4" /> Upload file
        </Button>
      </div>

      {uploadOpen && (
        <UploadForm
          library="vault"
          documentType="other"
          companyNameLocked={ADMARK_VAULT_COMPANY}
          onCancel={() => setUploadOpen(false)}
          onSave={saveUpload}
        />
      )}

      {files.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No files yet. Upload SOPs, company docs, or partnership drafts — title them yourself.
        </p>
      ) : (
        <div className={TILE_GRID}>
          {files.map((document) => (
            <DocumentTile
              key={document.id}
              document={document}
              onOpen={() => setPreview(document)}
              onRemove={() => void remove(document)}
            />
          ))}
        </div>
      )}
      <DocumentPreviewDialog document={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
