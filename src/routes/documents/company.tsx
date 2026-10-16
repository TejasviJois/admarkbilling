import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { DocumentsBreadcrumb } from "@/components/documents/documents-ui";
import { ComplianceDocumentsPanel } from "@/components/settings/ComplianceDocumentsPanel";
import { OperationsPageHeader } from "@/components/operations/operations-ui";
import { logClientError } from "@/lib/client-logger";
import { loadCompany, saveCompany } from "@/lib/storage";
import type { CompanySettings, ComplianceDocument } from "@/lib/types";

export const Route = createFileRoute("/documents/company")({ component: DocumentsCompanyPage });

function DocumentsCompanyPage() {
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [saved, setSaved] = useState(false);
  const latestRef = useRef<CompanySettings | null>(null);
  latestRef.current = company;

  const complianceSig =
    company != null
      ? `${company.udyamCertificateDataUrl?.length ?? 0}:${(company.complianceDocuments ?? []).length}:${(
          company.complianceDocuments ?? []
        )
          .map((d) => `${d.id}|${d.title}|${d.externalUrl ?? ""}|${d.fileName ?? ""}`)
          .join("¬")}`
      : "";

  const primedComplianceAutoSave = useRef(false);

  useEffect(() => {
    void loadCompany()
      .then(setCompany)
      .catch((e) => logClientError("documents.company.load", e));
  }, []);

  useEffect(() => {
    if (complianceSig === "") return;
    if (!primedComplianceAutoSave.current) {
      primedComplianceAutoSave.current = true;
      return;
    }
    const id = window.setTimeout(() => {
      const cur = latestRef.current;
      if (!cur) return;
      void saveCompany(cur)
        .then(() => {
          setSaved(true);
          window.setTimeout(() => setSaved(false), 2000);
        })
        .catch((err) => {
          logClientError("documents.company.save", err);
          alert(
            err instanceof Error
              ? err.message
              : "Could not save (storage full or network). Try a smaller file or use a link instead.",
          );
        });
    }, 450);
    return () => window.clearTimeout(id);
  }, [complianceSig]);

  const handleUdyamPdf = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      alert("Please choose a PDF file.");
      e.target.value = "";
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      alert("PDF too large (max 4MB).");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setCompany((prev) =>
        prev ? { ...prev, udyamCertificateDataUrl: String(reader.result) } : null,
      );
    };
    reader.readAsDataURL(file);
  };

  if (!company) {
    return <p className="text-sm text-muted-foreground">Loading company documents…</p>;
  }

  return (
    <div>
      <DocumentsBreadcrumb
        items={[{ label: "Documents", to: "/documents" }, { label: "Company documents" }]}
      />
      <OperationsPageHeader
        title="Company documents"
        description="All company files in one list — open any document, or add more below."
        action={
          saved ? <span className="text-xs font-medium text-emerald-400">Saved</span> : undefined
        }
      />

      <section className="rounded-3xl border border-white/10 bg-[#141419]/80 p-6 shadow-xl backdrop-blur-2xl sm:p-7">
        <ComplianceDocumentsPanel
          company={company}
          onUdyamUpload={handleUdyamPdf}
          onUdyamClear={() =>
            setCompany((prev) => (prev ? { ...prev, udyamCertificateDataUrl: undefined } : null))
          }
          onDocumentsChange={(docs: ComplianceDocument[]) =>
            setCompany((prev) => (prev ? { ...prev, complianceDocuments: docs } : null))
          }
        />
      </section>
    </div>
  );
}
