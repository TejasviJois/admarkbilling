import { useRef, useState } from "react";
import { ExternalLink, FileText, Link2, Plus, Trash2, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CompanySettings, ComplianceDocument } from "@/lib/types";
import { udyamCertificateSrc } from "@/lib/company-branding";
import { fileFromUpload } from "@/components/documents/proof-ui";
import { logClientError } from "@/lib/client-logger";

const MAX_FILE_BYTES = 6 * 1024 * 1024;
const MAX_ITEMS = 25;

const FILE_ACCEPT =
  ".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*";

function newComplianceId(): string {
  return `cd_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function isSafeHttpUrl(u: string): boolean {
  try {
    const x = new URL(u.trim());
    return x.protocol === "https:" || x.protocol === "http:";
  } catch {
    return false;
  }
}

const openBtn =
  "inline-flex items-center gap-1.5 rounded-md border border-input bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary";

/** Simple flat list: every document by name with one Open button. */
export function ComplianceDocumentsPanel({
  company,
  onUdyamUpload,
  onUdyamClear,
  onDocumentsChange,
  addOpen,
  onAddOpenChange,
}: {
  company: CompanySettings;
  onUdyamUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUdyamClear: () => void;
  onDocumentsChange: (docs: ComplianceDocument[]) => void;
  /** Controlled add-dialog state — lets the page header own the + button. */
  addOpen?: boolean;
  onAddOpenChange?: (open: boolean) => void;
}) {
  const docs = company.complianceDocuments ?? [];
  const [internalAddOpen, setInternalAddOpen] = useState(false);
  const isAddOpen = addOpen ?? internalAddOpen;
  const setAddOpen = onAddOpenChange ?? setInternalAddOpen;

  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const udyamSrc = udyamCertificateSrc(company);
  const hasCustomUdyam = Boolean(company.udyamCertificateDataUrl?.trim());

  const closeAddDialog = () => {
    setNewTitle("");
    setNewUrl("");
    setAddOpen(false);
  };

  const removeDoc = (id: string) => {
    onDocumentsChange(docs.filter((d) => d.id !== id));
  };

  const addExternalLink = () => {
    const title = newTitle.trim();
    const url = newUrl.trim();
    if (!title) {
      alert("Enter a document name.");
      return;
    }
    if (!url) {
      alert("Paste a link (https://…) or upload a file instead.");
      return;
    }
    if (!isSafeHttpUrl(url)) {
      alert("Enter a valid http(s) URL — e.g. a DigiLocker or Google Drive link.");
      return;
    }
    if (docs.length >= MAX_ITEMS) {
      alert(`You can add up to ${MAX_ITEMS} items. Remove one to add more.`);
      return;
    }
    onDocumentsChange([...docs, { id: newComplianceId(), title, externalUrl: url }]);
    closeAddDialog();
  };

  const pickFile = () => {
    if (!newTitle.trim()) {
      alert("Enter a document name first, then choose a file.");
      return;
    }
    fileInputRef.current?.click();
  };

  const onComplianceFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      alert("File too large (max 6MB per file).");
      return;
    }
    const title = newTitle.trim();
    if (!title) return;
    if (docs.length >= MAX_ITEMS) {
      alert(`You can add up to ${MAX_ITEMS} items.`);
      return;
    }
    const docId = newComplianceId();
    void fileFromUpload(file, `company/compliance/${docId}`)
      .then(({ fileDataUrl, fileName, mimeType }) => {
        onDocumentsChange([...docs, { id: docId, title, fileDataUrl, fileName, mimeType }]);
        closeAddDialog();
      })
      .catch((err) => {
        logClientError("compliance.fileUpload", err);
        alert(err instanceof Error ? err.message : "Could not upload file.");
      });
  };

  const sortedDocs = [...docs].sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div>
      {addOpen === undefined && (
        <div className="mb-3 flex justify-end">
          <Button type="button" size="sm" variant="outline" onClick={() => setAddOpen(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Add document
          </Button>
        </div>
      )}
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-background/40">
        {/* Udyam / MSME certificate — always present */}
        <li className="flex items-center gap-3 p-4">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            Udyam / MSME Certificate
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <a href={udyamSrc} target="_blank" rel="noopener noreferrer" className={openBtn}>
              <ExternalLink className="h-3.5 w-3.5" /> Open
            </a>
            <label
              className="cursor-pointer rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Replace certificate PDF"
            >
              <Upload className="h-3.5 w-3.5" />
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={onUdyamUpload}
              />
            </label>
            {hasCustomUdyam && (
              <button
                type="button"
                onClick={onUdyamClear}
                className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                title="Restore default certificate"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </li>

        {sortedDocs.map((d) => (
          <li key={d.id} className="flex items-center gap-3 p-4">
            {d.externalUrl ? (
              <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
              {d.title}
            </span>
            <div className="flex shrink-0 items-center gap-2">
              <a
                href={d.externalUrl ?? d.fileDataUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={openBtn}
              >
                <ExternalLink className="h-3.5 w-3.5" /> Open
              </a>
              <button
                type="button"
                onClick={() => removeDoc(d.id)}
                className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                title="Remove document"
                aria-label={`Remove ${d.title}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={isAddOpen} onOpenChange={(open) => (open ? setAddOpen(true) : closeAddDialog())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a document</DialogTitle>
            <DialogDescription>
              Upload a file (PDF, Word, image — up to 6 MB) or save an external link.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                Document name
              </span>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. GST registration"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                External link (optional)
              </span>
              <Input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://…"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={pickFile} className="gap-1.5">
                <Upload className="h-3.5 w-3.5" /> Upload file
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={addExternalLink} className="gap-1.5">
                <Link2 className="h-3.5 w-3.5" /> Save link
              </Button>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={FILE_ACCEPT}
            className="hidden"
            onChange={onComplianceFile}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
