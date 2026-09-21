import { useRef, useState } from "react";
import { FileText, Link2, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fileFromUpload } from "@/components/documents/proof-ui";
import { useResolvedFileUrl } from "@/hooks/use-resolved-file-url";
import { logClientError } from "@/lib/client-logger";
import type { DocumentsPersistOptions } from "@/lib/documents-storage";
import { safeHref } from "@/lib/utils";
import type { Agreement, AgreementCounterpartyType } from "@/lib/types";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ITEMS = 50;

const FILE_ACCEPT =
  ".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*";

const COUNTERPARTY_TYPES: { value: AgreementCounterpartyType; label: string }[] = [
  { value: "client", label: "Client" },
  { value: "partner", label: "Partner" },
  { value: "vendor", label: "Vendor" },
  { value: "other", label: "Other" },
];

function newAgreementId(): string {
  return `agr_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function isSafeHttpUrl(u: string): boolean {
  try {
    const x = new URL(u.trim());
    return x.protocol === "https:" || x.protocol === "http:";
  } catch {
    return false;
  }
}

const btnRow =
  "inline-flex items-center gap-1.5 rounded-md border border-input bg-card px-2.5 py-1.5 text-xs font-medium hover:bg-secondary";

function AgreementFileLinks({
  fileDataUrl,
  fileName,
}: {
  fileDataUrl: string;
  fileName?: string;
}) {
  const resolved = useResolvedFileUrl(fileDataUrl);
  const href = resolved || fileDataUrl;
  return (
    <>
      <a href={href} target="_blank" rel="noopener noreferrer" className={btnRow}>
        <FileText className="h-3 w-3" /> Open
      </a>
      <a href={href} download={fileName || "agreement"} className={btnRow}>
        <FileText className="h-3 w-3" /> Download
      </a>
    </>
  );
}

const emptyForm = (): Omit<Agreement, "id" | "createdAt" | "updatedAt"> => ({
  title: "",
  counterpartyName: "",
  counterpartyType: "client",
  counterpartyRef: undefined,
  signedDate: "",
  expiryDate: "",
  fileDataUrl: undefined,
  fileName: undefined,
  mimeType: undefined,
  externalUrl: undefined,
  notes: "",
});

export function AgreementsPanel({
  agreements,
  onChange,
  saving,
}: {
  agreements: Agreement[];
  onChange: (next: Agreement[], options?: DocumentsPersistOptions) => void | Promise<void>;
  saving?: boolean;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setForm(emptyForm());
    setEditingId(null);
    setFormOpen(false);
  };

  const openAdd = () => {
    setForm(emptyForm());
    setEditingId(null);
    setFormOpen(true);
  };

  const openEdit = (a: Agreement) => {
    setForm({
      title: a.title,
      counterpartyName: a.counterpartyName,
      counterpartyType: a.counterpartyType,
      counterpartyRef: a.counterpartyRef,
      signedDate: a.signedDate ?? "",
      expiryDate: a.expiryDate ?? "",
      fileDataUrl: a.fileDataUrl,
      fileName: a.fileName,
      mimeType: a.mimeType,
      externalUrl: a.externalUrl,
      notes: a.notes ?? "",
    });
    setEditingId(a.id);
    setFormOpen(true);
  };

  const remove = (id: string) => {
    if (!confirm("Remove this agreement from the vault?")) return;
    void onChange(
      agreements.filter((a) => a.id !== id),
      {
        deleteIds: { agreements: [id] },
      },
    );
  };

  const save = async () => {
    const title = form.title.trim();
    const counterpartyName = form.counterpartyName.trim();
    if (!title) {
      alert("Enter an agreement title.");
      return;
    }
    if (!counterpartyName) {
      alert("Enter the counterparty name.");
      return;
    }
    if (!form.fileDataUrl && !form.externalUrl?.trim()) {
      alert("Attach a file or paste a link to the agreement.");
      return;
    }
    if (form.externalUrl?.trim() && !isSafeHttpUrl(form.externalUrl)) {
      alert("Enter a valid http(s) URL for the external link.");
      return;
    }

    const now = Date.now();
    const payload: Agreement = {
      id: editingId ?? newAgreementId(),
      title,
      counterpartyName,
      counterpartyType: form.counterpartyType,
      counterpartyRef: form.counterpartyRef?.trim() || undefined,
      signedDate: form.signedDate?.trim() || undefined,
      expiryDate: form.expiryDate?.trim() || undefined,
      fileDataUrl: form.fileDataUrl,
      fileName: form.fileName,
      mimeType: form.mimeType,
      externalUrl: form.externalUrl?.trim() || undefined,
      notes: form.notes?.trim() || undefined,
      createdAt: editingId ? (agreements.find((a) => a.id === editingId)?.createdAt ?? now) : now,
      updatedAt: now,
    };

    const next = editingId
      ? agreements.map((a) => (a.id === editingId ? payload : a))
      : agreements.length >= MAX_ITEMS
        ? (alert(`Maximum ${MAX_ITEMS} agreements. Remove one to add more.`), agreements)
        : [payload, ...agreements];

    if (next === agreements) return;
    await onChange(next);
    resetForm();
  };

  const onFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      alert("File too large (max 6MB).");
      return;
    }
    const agreementId = editingId ?? newAgreementId();
    void fileFromUpload(file, `documents/agreements/${agreementId}`)
      .then(({ fileDataUrl, fileName, mimeType }) => {
        setForm((prev) => ({
          ...prev,
          fileDataUrl,
          fileName,
          mimeType,
          externalUrl: undefined,
        }));
      })
      .catch((err) => {
        logClientError("agreements.fileUpload", err);
        alert(err instanceof Error ? err.message : "Could not upload file.");
      });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-foreground">Agreements</h2>
        <Button
          type="button"
          size="sm"
          className="h-10 gap-1.5 rounded-lg px-4"
          onClick={openAdd}
          disabled={saving}
        >
          <Plus className="h-4 w-4" />
          Add agreement
        </Button>
      </div>

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) resetForm();
          else setFormOpen(true);
        }}
      >
        <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto p-0 sm:max-w-lg">
          <DialogHeader className="border-b border-border/80 px-5 py-4 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight">
              {editingId ? "Edit agreement" : "New agreement"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Attach a file or paste a link.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-5 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Title</span>
                <input
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. Website development MOU"
                  className="h-9 w-full rounded-md border border-border/80 bg-background px-3 text-sm outline-none focus:border-border"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Counterparty
                </span>
                <input
                  value={form.counterpartyName}
                  onChange={(e) => setForm((p) => ({ ...p, counterpartyName: e.target.value }))}
                  placeholder="Client / partner / vendor name"
                  className="h-9 w-full rounded-md border border-border/80 bg-background px-3 text-sm outline-none focus:border-border"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Type</span>
                <select
                  value={form.counterpartyType}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      counterpartyType: e.target.value as AgreementCounterpartyType,
                    }))
                  }
                  className="h-9 w-full rounded-md border border-border/80 bg-background px-3 text-sm outline-none focus:border-border"
                >
                  {COUNTERPARTY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Signed date
                </span>
                <input
                  type="date"
                  value={form.signedDate ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, signedDate: e.target.value }))}
                  className="h-9 w-full rounded-md border border-border/80 bg-background px-3 text-sm outline-none focus:border-border"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Expiry (optional)
                </span>
                <input
                  type="date"
                  value={form.expiryDate ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, expiryDate: e.target.value }))}
                  className="h-9 w-full rounded-md border border-border/80 bg-background px-3 text-sm outline-none focus:border-border"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Or paste a link
                </span>
                <input
                  value={form.externalUrl ?? ""}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      externalUrl: e.target.value,
                      fileDataUrl: e.target.value.trim() ? undefined : p.fileDataUrl,
                    }))
                  }
                  placeholder="https://…"
                  className="h-9 w-full rounded-md border border-border/80 bg-background px-3 text-sm outline-none focus:border-border"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Notes</span>
                <textarea
                  value={form.notes ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  rows={2}
                  className="w-full rounded-md border border-border/80 bg-background px-3 py-2 text-sm outline-none focus:border-border"
                />
              </label>
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">File</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-9 w-full items-center gap-2 rounded-md border border-dashed border-border/80 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
              >
                <Upload className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {form.fileName ?? (form.fileDataUrl ? "Replace file" : "Choose file (max 5MB)")}
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept={FILE_ACCEPT}
                className="hidden"
                onChange={onFilePick}
              />
            </div>

            <DialogFooter className="gap-2 border-t border-border/80 pt-4 sm:justify-end">
              <Button type="button" size="sm" variant="outline" onClick={resetForm}>
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={() => void save()} disabled={saving}>
                {saving ? "Saving…" : editingId ? "Update" : "Save"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {agreements.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/80 py-12 text-center text-sm text-muted-foreground">
          No agreements stored yet. Add your first contract or MOU.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {agreements.map((a) => (
            <li
              key={a.id}
              className="rounded-xl border border-border/80 bg-card/40 p-4 transition-colors hover:border-border hover:bg-card/70"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{a.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {a.counterpartyName}
                    <span className="mx-1.5 text-border">·</span>
                    <span className="capitalize">{a.counterpartyType}</span>
                  </p>
                  {(a.signedDate || a.expiryDate) && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {a.signedDate && `Signed ${a.signedDate}`}
                      {a.signedDate && a.expiryDate && " · "}
                      {a.expiryDate && `Expires ${a.expiryDate}`}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(a)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(a.id)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-400"
                    title="Remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {safeHref(a.externalUrl) && (
                  <a
                    href={safeHref(a.externalUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={btnRow}
                  >
                    <Link2 className="h-3 w-3" /> Open link
                  </a>
                )}
                {a.fileDataUrl ? (
                  <AgreementFileLinks fileDataUrl={a.fileDataUrl} fileName={a.fileName} />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
