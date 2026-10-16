import { useRef, useState } from "react";
import { FileText, Link2, Trash2, Upload } from "lucide-react";
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

const btnRow =
  "inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/[0.1] hover:text-white transition-all active:scale-[0.98]";

export function ComplianceDocumentsPanel({
  company,
  onUdyamUpload,
  onUdyamClear,
  onDocumentsChange,
}: {
  company: CompanySettings;
  onUdyamUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUdyamClear: () => void;
  onDocumentsChange: (docs: ComplianceDocument[]) => void;
}) {
  const docs = company.complianceDocuments ?? [];
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const udyamSrc = udyamCertificateSrc(company);
  const hasCustomUdyam = Boolean(company.udyamCertificateDataUrl?.trim());

  const removeDoc = (id: string) => {
    onDocumentsChange(docs.filter((d) => d.id !== id));
  };

  const addExternalLink = () => {
    const title = newTitle.trim();
    const url = newUrl.trim();
    if (!title) {
      alert("Enter a title (e.g. DigiLocker issued document, Drive folder).");
      return;
    }
    if (!url) {
      alert("Paste a link (https://…).");
      return;
    }
    if (!isSafeHttpUrl(url)) {
      alert("Enter a valid http(s) URL — e.g. a DigiLocker link or Google Drive share link.");
      return;
    }
    if (docs.length >= MAX_ITEMS) {
      alert(`You can add up to ${MAX_ITEMS} items. Remove one to add more.`);
      return;
    }
    onDocumentsChange([...docs, { id: newComplianceId(), title, externalUrl: url }]);
    setNewTitle("");
    setNewUrl("");
  };

  const pickFile = () => {
    if (!newTitle.trim()) {
      alert("Enter a document title first, then choose a file.");
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
        onDocumentsChange([
          ...docs,
          {
            id: docId,
            title,
            fileDataUrl,
            fileName,
            mimeType,
          },
        ]);
        setNewTitle("");
      })
      .catch((err) => {
        logClientError("compliance.fileUpload", err);
        alert(err instanceof Error ? err.message : "Could not upload file.");
      });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <h3 className="text-base font-bold text-white">Udyam / MSME Certificate</h3>
          <p className="mt-0.5 text-xs text-white/50">
            Bundled PDF by default — replace with yours on Save.
          </p>
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">
              {hasCustomUdyam ? "Uploaded Udyam certificate.pdf" : "ADMARK-Udyam-certificate.pdf"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href={udyamSrc} target="_blank" rel="noopener noreferrer" className={btnRow}>
              <FileText className="h-3.5 w-3.5 text-[#ff6b2b]" /> Open
            </a>
            <a href={udyamSrc} download="ADMARK-Udyam-certificate.pdf" className={btnRow}>
              <FileText className="h-3.5 w-3.5 text-[#ff6b2b]" /> Download
            </a>
            <label className={`${btnRow} cursor-pointer`}>
              <Upload className="h-3.5 w-3.5 text-white/60" /> Replace
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
                className="text-xs text-white/40 hover:text-red-400 sm:ml-1 transition-colors"
              >
                Use default
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="text-base font-bold text-white">Other compliance documents</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-white/50">
            PDFs, Word, images, or https links. Open / Download only — no preview.
          </p>
        </div>

        <div className="space-y-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.015] p-4">
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/40">
              Title for next item
            </span>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. GST registration, PAN card"
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-[#ff6b2b]/50 focus:ring-1 focus:ring-[#ff6b2b]/20 transition-all"
            />
          </label>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block min-w-0 flex-1">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/40">
                External link
              </span>
              <input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://…"
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-[#ff6b2b]/50 focus:ring-1 focus:ring-[#ff6b2b]/20 transition-all"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={addExternalLink}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#ff6b2b] to-[#f04400] px-3.5 py-2 text-xs font-semibold text-white shadow-[0_0_12px_rgba(255,107,43,0.3)] hover:brightness-110 transition-all active:scale-[0.98]"
              >
                <Link2 className="h-3.5 w-3.5" /> Add link
              </button>
              <button type="button" onClick={pickFile} className={`${btnRow} py-2`}>
                <Upload className="h-3.5 w-3.5 text-white/60" /> Add file
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept={FILE_ACCEPT}
                className="hidden"
                onChange={onComplianceFile}
              />
            </div>
          </div>
        </div>

        {docs.length === 0 ? (
          <p className="text-xs text-white/40 py-2">No extra documents yet.</p>
        ) : (
          <ul className="divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/[0.02]">
            {docs.map((d) => (
              <li key={d.id} className="p-4 transition-colors hover:bg-white/[0.02]">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white">{d.title}</p>
                    {d.fileName && (
                      <p className="mt-0.5 text-xs text-white/40">{d.fileName}</p>
                    )}
                    {d.externalUrl && (
                      <p className="mt-0.5 line-clamp-1 break-all text-xs text-[#ff6b2b]/80">
                        {d.externalUrl}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeDoc(d.id)}
                    className="shrink-0 rounded-lg p-1.5 text-white/40 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                    title="Remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {d.externalUrl && (
                    <a
                      href={d.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={btnRow}
                    >
                      <Link2 className="h-3.5 w-3.5 text-[#ff6b2b]" /> Open Link
                    </a>
                  )}
                  {d.fileDataUrl && (
                    <>
                      <a
                        href={d.fileDataUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={btnRow}
                      >
                        <FileText className="h-3.5 w-3.5 text-[#ff6b2b]" /> Open File
                      </a>
                      <a
                        href={d.fileDataUrl}
                        download={d.fileName || "document"}
                        className={btnRow}
                      >
                        <FileText className="h-3.5 w-3.5 text-[#ff6b2b]" /> Download
                      </a>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
