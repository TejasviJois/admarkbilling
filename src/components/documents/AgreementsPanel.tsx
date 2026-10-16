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
  "inline-flex items-center gap-1.5 rounded-xl border border-white/10 glass-card px-3 py-1.5 text-xs font-semibold text-white/80 transition-colors hover:border-white/25 hover:text-white";

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
        <h2 className="text-xs font-bold uppercase tracking-wider text-white/50">Stored Agreements</h2>
        <Button
          type="button"
          size="sm"
          className="h-10 gap-1.5 rounded-xl bg-gradient-to-r from-[#ff6b2b] to-[#f04400] px-4 font-bold text-white shadow-lg shadow-[#ff6b2b]/20 hover:shadow-[0_0_20px_rgba(255,107,43,0.4)] transition-all"
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
        <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto border-white/10 bg-[#121217]/95 p-0 sm:max-w-lg backdrop-blur-2xl">
          <DialogHeader className="border-b border-white/10 px-6 py-4 text-left">
            <DialogTitle className="text-base font-bold tracking-tight text-white">
              {editingId ? "Edit agreement" : "New agreement"}
            </DialogTitle>
            <DialogDescription className="text-xs text-white/50">
              Attach a PDF/document file or paste a secure cloud link.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-6 py-5">
            <div className="grid gap-3.5 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs font-semibold text-white/60">Title</span>
                <input
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. Website development MOU"
                  className="h-9 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-[#ff6b2b]/50"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-white/60">
                  Counterparty
                </span>
                <input
                  value={form.counterpartyName}
                  onChange={(e) => setForm((p) => ({ ...p, counterpartyName: e.target.value }))}
                  placeholder="Client / partner / vendor name"
                  className="h-9 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-[#ff6b2b]/50"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-white/60">Type</span>
                <select
                  value={form.counterpartyType}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      counterpartyType: e.target.value as AgreementCounterpartyType,
                    }))
                  }
                  className="h-9 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-[#ff6b2b]/50"
                >
                  {COUNTERPARTY_TYPES.map((t) => (
                    <option key={t.value} value={t.value} className="bg-[#16161c]">
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-white/60">
                  Signed date
                </span>
                <input
                  type="date"
                  value={form.signedDate ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, signedDate: e.target.value }))}
                  className="h-9 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-[#ff6b2b]/50 [color-scheme:dark]"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-white/60">
                  Expiry (optional)
                </span>
                <input
                  type="date"
                  value={form.expiryDate ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, expiryDate: e.target.value }))}
                  className="h-9 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-[#ff6b2b]/50 [color-scheme:dark]"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs font-semibold text-white/60">
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
                  className="h-9 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-[#ff6b2b]/50"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs font-semibold text-white/60">Notes</span>
                <textarea
                  value={form.notes ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  rows={2}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:border-[#ff6b2b]/50"
                />
              </label>
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-semibold text-white/60">File</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-10 w-full items-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-3.5 text-sm text-white/60 transition-colors hover:border-[#ff6b2b]/40 hover:text-white"
              >
                <Upload className="h-4 w-4 shrink-0 text-[#ff6b2b]" />
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

            <DialogFooter className="gap-2 border-t border-white/10 pt-4 sm:justify-end">
              <Button type="button" size="sm" variant="outline" className="rounded-xl border-white/10 glass-card text-white hover:bg-white/5" onClick={resetForm}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="rounded-xl bg-gradient-to-r from-[#ff6b2b] to-[#f04400] text-white font-bold"
                onClick={() => void save()}
                disabled={saving}
              >
                {saving ? "Saving…" : editingId ? "Update" : "Save"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {agreements.length === 0 ? (
        <div className="rounded-2xl border border-white/10 glass-panel py-16 text-center text-sm text-white/40">
          No agreements stored yet. Add your first contract or MOU.
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {agreements.map((a) => (
            <li
              key={a.id}
              className="rounded-2xl border border-white/10 glass-panel p-5 transition-all duration-300 hover:border-white/20 hover:scale-[1.01] hover:shadow-xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-white text-base">{a.title}</p>
                  <p className="mt-1 text-xs text-white/60">
                    {a.counterpartyName}
                    <span className="mx-1.5 text-white/30">·</span>
                    <span className="capitalize font-semibold text-[#ff6b2b]">{a.counterpartyType}</span>
                  </p>
                  {(a.signedDate || a.expiryDate) && (
                    <p className="mt-1.5 text-[11px] font-mono text-white/40">
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
                    className="rounded-lg p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(a.id)}
                    className="rounded-lg p-1.5 text-white/50 transition-colors hover:bg-rose-500/10 hover:text-rose-400"
                    title="Remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 pt-3 border-t border-white/5">
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
