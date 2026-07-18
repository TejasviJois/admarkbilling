import { useMemo, useRef, useState } from "react";
import { Download, ExternalLink, FileText, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fileFromUpload } from "@/components/documents/proof-ui";
import { loadCompany } from "@/lib/storage";
import { downloadInvoicePdf } from "@/lib/pdf";
import { logClientError } from "@/lib/client-logger";
import type { DocumentsPersistOptions } from "@/lib/documents-storage";
import { safeHref } from "@/lib/utils";
import type {
  Agreement,
  ArchiveDocument,
  ArchiveDocumentType,
  Client,
  DocumentsData,
  Invoice,
} from "@/lib/types";

const FILE_ACCEPT =
  ".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*";
const MAX_FILE_BYTES = 5 * 1024 * 1024;

type ArchiveRow =
  | {
      kind: "invoice";
      id: string;
      title: string;
      type: string;
      company: string;
      date: number;
      invoice: Invoice;
    }
  | {
      kind: "agreement";
      id: string;
      title: string;
      type: string;
      company: string;
      date: number;
      agreement: Agreement;
    }
  | {
      kind: "upload";
      id: string;
      title: string;
      type: string;
      company: string;
      date: number;
      document: ArchiveDocument;
    };

function newDocumentId() {
  return `doc_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function displayDate(timestamp: number) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp));
}

export function DocumentArchive({
  invoices,
  documents,
  clients,
  saving,
  onChange,
}: {
  invoices: Invoice[];
  documents: DocumentsData;
  clients: Client[];
  saving: boolean;
  onChange: (next: DocumentsData, options?: DocumentsPersistOptions) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [documentType, setDocumentType] = useState<ArchiveDocumentType>("agreement");
  const [customType, setCustomType] = useState("");
  const [clientId, setClientId] = useState("");
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const rows = useMemo<ArchiveRow[]>(() => {
    const invoiceRows: ArchiveRow[] = invoices.map((invoice) => ({
      kind: "invoice",
      id: `invoice-${invoice.id}`,
      title: `Invoice ${invoice.number}`,
      type: "Invoice",
      company: invoice.clientName,
      date: new Date(invoice.date).getTime() || invoice.createdAt,
      invoice,
    }));
    const agreementRows: ArchiveRow[] = documents.agreements.map((agreement) => ({
      kind: "agreement",
      id: `agreement-${agreement.id}`,
      title: agreement.title,
      type: "Agreement",
      company: agreement.counterpartyName,
      date: agreement.updatedAt,
      agreement,
    }));
    const uploadRows: ArchiveRow[] = (documents.archiveDocuments ?? []).map((document) => ({
      kind: "upload",
      id: `upload-${document.id}`,
      title: document.title,
      type:
        document.documentType === "other"
          ? document.customType || "Other"
          : document.documentType === "proposal"
            ? "Proposal"
            : "Agreement",
      company: document.clientName,
      date: document.updatedAt,
      document,
    }));
    return [...invoiceRows, ...agreementRows, ...uploadRows].sort((a, b) => b.date - a.date);
  }, [documents, invoices]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) =>
      [row.title, row.type, row.company].some((value) => value.toLowerCase().includes(query)),
    );
  }, [rows, search]);

  const resetUpload = () => {
    setTitle("");
    setDocumentType("agreement");
    setCustomType("");
    setClientId("");
    setPickedFile(null);
    setUploadOpen(false);
  };

  const saveUpload = async () => {
    const selectedClient = clients.find((client) => client.id === clientId);
    if (!title.trim()) return alert("Enter a document title.");
    if (!selectedClient) return alert("Choose the company this document belongs to.");
    if (documentType === "other" && !customType.trim()) {
      return alert("Type what kind of document you are uploading.");
    }
    if (!pickedFile) return alert("Choose a file to upload.");
    if (pickedFile.size > MAX_FILE_BYTES) return alert("File too large (max 6MB).");

    setUploading(true);
    try {
      const id = newDocumentId();
      const uploaded = await fileFromUpload(pickedFile, `documents/archive/${id}`);
      const now = Date.now();
      const nextDocument: ArchiveDocument = {
        id,
        title: title.trim(),
        documentType,
        customType: documentType === "other" ? customType.trim() : undefined,
        clientId: selectedClient.id,
        clientName: selectedClient.companyName,
        ...uploaded,
        createdAt: now,
        updatedAt: now,
      };
      await onChange({
        ...documents,
        archiveDocuments: [nextDocument, ...(documents.archiveDocuments ?? [])],
      });
      resetUpload();
    } catch (error) {
      logClientError("documents.archive.upload", error);
      alert(error instanceof Error ? error.message : "Could not upload document.");
    } finally {
      setUploading(false);
    }
  };

  const removeUpload = async (document: ArchiveDocument) => {
    if (!confirm(`Remove "${document.title}" from the archive?`)) return;
    await onChange(
      {
        ...documents,
        archiveDocuments: documents.archiveDocuments.filter((item) => item.id !== document.id),
      },
      { deleteIds: { archiveDocuments: [document.id] } },
    );
  };

  const downloadInvoice = (invoice: Invoice) => {
    void loadCompany()
      .then((company) => downloadInvoicePdf(invoice, company))
      .catch((error) => logClientError("documents.archive.invoice", error));
  };

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search documents, companies, or types…"
            className="pl-9"
            aria-label="Search documents"
          />
        </div>
        <Button type="button" size="sm" onClick={() => setUploadOpen(true)}>
          <Plus className="h-4 w-4" /> Upload document
        </Button>
      </div>

      {uploadOpen && (
        <div className="mt-4 rounded-lg border border-border bg-muted/20 p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Upload document</h2>
            <button type="button" onClick={resetUpload} aria-label="Close upload form">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs text-muted-foreground">Document title</span>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label>
              <span className="mb-1 block text-xs text-muted-foreground">
                What are you uploading?
              </span>
              <select
                value={documentType}
                onChange={(event) => setDocumentType(event.target.value as ArchiveDocumentType)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="agreement">Agreement</option>
                <option value="proposal">Proposal document</option>
                <option value="other">Other</option>
              </select>
            </label>
            {documentType === "other" && (
              <label>
                <span className="mb-1 block text-xs text-muted-foreground">Document type</span>
                <Input
                  value={customType}
                  onChange={(event) => setCustomType(event.target.value)}
                  placeholder="Type the document category"
                />
              </label>
            )}
            <label className={documentType === "other" ? "" : "sm:col-start-2"}>
              <span className="mb-1 block text-xs text-muted-foreground">Company</span>
              <select
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select company…</option>
                {clients
                  .slice()
                  .sort((a, b) => a.companyName.localeCompare(b.companyName))
                  .map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.companyName}
                    </option>
                  ))}
              </select>
            </label>
            <div className="sm:col-span-2">
              <span className="mb-1 block text-xs text-muted-foreground">File</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-9 w-full items-center gap-2 rounded-md border border-dashed border-input bg-background px-3 text-sm text-muted-foreground hover:bg-secondary"
              >
                <Upload className="h-4 w-4" />
                {pickedFile?.name ?? "Choose PDF, Word document, or image"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept={FILE_ACCEPT}
                className="hidden"
                onChange={(event) => setPickedFile(event.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => void saveUpload()}
              disabled={uploading || saving}
            >
              {uploading || saving ? "Saving…" : "Save document"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={resetUpload}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="mt-5 divide-y divide-border">
        {filteredRows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {rows.length === 0 ? "No documents yet." : "No documents match your search."}
          </p>
        ) : (
          filteredRows.map((row) => (
            <div key={row.id} className="flex items-center gap-3 py-3">
              <FileText className="h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{row.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {row.type} · {row.company} · {displayDate(row.date)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {row.kind === "invoice" && (
                  <button
                    type="button"
                    onClick={() => downloadInvoice(row.invoice)}
                    className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    title="Download invoice PDF"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                )}
                {row.kind !== "invoice" &&
                  safeHref(
                    (row.kind === "agreement" ? row.agreement : row.document).externalUrl,
                  ) && (
                    <a
                      href={safeHref(
                        (row.kind === "agreement" ? row.agreement : row.document).externalUrl,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      title="Open document"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                {row.kind !== "invoice" &&
                  (row.kind === "agreement" ? row.agreement : row.document).fileDataUrl && (
                    <a
                      href={(row.kind === "agreement" ? row.agreement : row.document).fileDataUrl}
                      download={
                        (row.kind === "agreement" ? row.agreement : row.document).fileName ||
                        "document"
                      }
                      className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      title="Download document"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  )}
                {row.kind === "upload" && (
                  <button
                    type="button"
                    onClick={() => void removeUpload(row.document)}
                    className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title="Remove document"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
