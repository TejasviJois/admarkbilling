import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Cloud, Database, LogOut, Save, Users } from "lucide-react";
import { ComplianceDocumentsPanel } from "@/components/settings/ComplianceDocumentsPanel";
import {
  PartnerCard,
  SettingsField,
  SettingsImageField,
  SettingsProfileHero,
  SettingsQuickLinks,
  SettingsSection,
} from "@/components/settings/settings-ui";
import { DEFAULT_COMPANY, DEFAULT_PUBLIC_LOGO_URL } from "@/lib/constants";
import { companyLogoSrc } from "@/lib/company-branding";
import { logClientError } from "@/lib/client-logger";
import { DEFAULT_FINANCIAL_BASELINE } from "@/lib/default-financial-baseline";
import { loadCompany, normalizeCompanySettings, saveCompany } from "@/lib/storage";
import { getDataBackendStatus } from "@/server/invoice-fns";
import { logoutFn } from "@/server/auth-fns";
import type { CompanyMember, CompanySettings } from "@/lib/types";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

function SettingsPage() {
  const router = useRouter();
  const [c, setC] = useState<CompanySettings>(() => normalizeCompanySettings(DEFAULT_COMPANY));
  const [syncing, setSyncing] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [backendLabel, setBackendLabel] = useState<string>("Checking storage…");
  const latestRef = useRef<CompanySettings | null>(null);
  latestRef.current = c;

  const complianceSig =
    c != null
      ? `${c.udyamCertificateDataUrl?.length ?? 0}:${(c.complianceDocuments ?? []).length}:${(c.complianceDocuments ?? [])
          .map((d) => `${d.id}|${d.title}|${d.externalUrl ?? ""}|${d.fileName ?? ""}`)
          .join("¬")}`
      : "";

  const primedComplianceAutoSave = useRef(false);

  useEffect(() => {
    void loadCompany()
      .then((loaded) => {
        setC(normalizeCompanySettings(loaded));
        setLoadError(null);
      })
      .catch((e) => {
        logClientError("settings.loadCompany", e);
        setLoadError("Could not load saved settings — showing defaults.");
        setC(normalizeCompanySettings(DEFAULT_COMPANY));
      })
      .finally(() => setSyncing(false));
    void getDataBackendStatus()
      .then((s) =>
        setBackendLabel(
          s.configured
            ? "Supabase — synced across devices"
            : "Browser localStorage — this device only",
        ),
      )
      .catch(() => setBackendLabel("Storage status unknown"));
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
          logClientError("settings.autoSave", err);
          alert(
            err instanceof Error
              ? err.message
              : "Could not save (storage full or network). Try a smaller file or use a link instead.",
          );
        });
    }, 450);
    return () => window.clearTimeout(id);
  }, [complianceSig]);

  const set = <K extends keyof CompanySettings>(k: K, v: CompanySettings[K]) => {
    setC((prev) => ({ ...prev, [k]: v }));
    setSaved(false);
  };

  const handleImage =
    (key: "logoDataUrl" | "signatureDataUrl") => (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        alert("Image too large (max 2MB)");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const data = String(reader.result);
        setC((prev) => ({ ...prev, [key]: data }));
        setSaved(false);
      };
      reader.readAsDataURL(file);
    };

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
      setC((prev) => ({ ...prev, udyamCertificateDataUrl: String(reader.result) }));
      setSaved(false);
      e.target.value = "";
    };
    reader.readAsDataURL(file);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cur = latestRef.current;
    if (!cur) return;
    void saveCompany(cur)
      .then(() => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      })
      .catch((err) => {
        logClientError("settings.save", err);
        alert(err instanceof Error ? err.message : "Could not save settings.");
      });
  };

  const updateMember = (
    id: string,
    patch: Partial<Pick<CompanyMember, "name" | "email" | "phone" | "role">>,
  ) => {
    setC((prev) => ({
      ...prev,
      companyMembers: (prev.companyMembers ?? []).map((m) =>
        m.id === id ? { ...m, ...patch } : m,
      ),
    }));
    setSaved(false);
  };

  const removeMember = (id: string) => {
    setC((prev) => {
      const list = (prev.companyMembers ?? []).filter((m) => m.id !== id);
      return { ...prev, companyMembers: list.length ? list : undefined };
    });
    setSaved(false);
  };

  const addMember = () => {
    const id = crypto.randomUUID();
    setC((prev) => ({
      ...prev,
      companyMembers: [
        ...(prev.companyMembers ?? []),
        { id, name: "", email: "", phone: "", role: "Partner" },
      ],
    }));
    setSaved(false);
  };

  const handleSignOut = () => {
    void logoutFn()
      .then(() => router.navigate({ to: "/login", replace: true, search: { redirect: undefined } }))
      .catch((e) => logClientError("settings.signOut", e));
  };

  const partners = c.companyMembers ?? [];
  const logoPreview = companyLogoSrc(c) || DEFAULT_PUBLIC_LOGO_URL;

  return (
    <form onSubmit={handleSave} className="space-y-8">
      {(syncing || loadError) && (
        <div
          className={`rounded-lg border px-4 py-2 text-sm ${
            loadError
              ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
              : "border-border bg-muted/30 text-muted-foreground"
          }`}
        >
          {loadError ?? "Syncing saved settings…"}
        </div>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Settings</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Company profile, partners, branding, bank details, and compliance — used on invoices and
            documents.
          </p>
        </div>
        <button
          type="submit"
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          <Save className="h-4 w-4" />
          {saved ? "Saved!" : "Save changes"}
        </button>
      </div>

      <nav className="flex flex-wrap gap-2 text-sm">
        {[
          { href: "#profile", label: "Profile" },
          { href: "#partners", label: "Partners" },
          { href: "#brand", label: "Brand" },
          { href: "#legal", label: "Legal & address" },
          { href: "#bank", label: "Bank" },
          { href: "#compliance", label: "Compliance" },
          { href: "#workspace", label: "Workspace" },
        ].map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="rounded-full border border-border bg-muted/30 px-3 py-1 text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
          >
            {item.label}
          </a>
        ))}
      </nav>

      <div id="profile">
        <SettingsProfileHero
          company={c}
          logoPreview={logoPreview}
          onLogoUpload={handleImage("logoDataUrl")}
          onLogoClear={() => set("logoDataUrl", undefined)}
          onFieldChange={set}
        />
      </div>

      <SettingsSection
        id="partners"
        title="Company partners"
        description={`${partners.length} partner${partners.length === 1 ? "" : "s"} — founders and core team with direct contact details.`}
      >
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4 shrink-0 text-primary" />
          <span>
            These profiles are internal references. External agency partners are managed under{" "}
            <Link to="/partnerships" className="font-medium text-primary hover:underline">
              Partnerships
            </Link>
            .
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {partners.map((member) => (
            <PartnerCard
              key={member.id}
              member={member}
              onChange={(patch) => updateMember(member.id, patch)}
              onRemove={() => removeMember(member.id)}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={addMember}
          className="mt-4 rounded-lg border border-dashed border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground"
        >
          Add partner
        </button>
      </SettingsSection>

      <div className="grid gap-6 lg:grid-cols-2">
        <SettingsSection id="brand" title="Brand assets" description="Logo and signature on invoices.">
          <div className="grid gap-4">
            <SettingsImageField
              label="Logo"
              value={c.logoDataUrl}
              emptyPreviewSrc={DEFAULT_PUBLIC_LOGO_URL}
              onChange={handleImage("logoDataUrl")}
              onClear={() => set("logoDataUrl", undefined)}
            />
            <SettingsImageField
              label="Signature"
              value={c.signatureDataUrl}
              onChange={handleImage("signatureDataUrl")}
              onClear={() => set("signatureDataUrl", undefined)}
            />
          </div>
        </SettingsSection>

        <SettingsSection id="bank" title="Bank details" description="Shown on invoices for client payments.">
          <div className="grid gap-4 sm:grid-cols-2">
            <SettingsField label="Bank name" value={c.bankName || ""} onChange={(v) => set("bankName", v)} />
            <SettingsField
              label="Account holder"
              value={c.accountName || ""}
              onChange={(v) => set("accountName", v)}
            />
            <SettingsField
              label="Account number"
              value={c.accountNumber || ""}
              onChange={(v) => set("accountNumber", v)}
            />
            <SettingsField label="IFSC" value={c.ifsc || ""} onChange={(v) => set("ifsc", v)} />
            <SettingsField label="Branch" value={c.branch || ""} onChange={(v) => set("branch", v)} />
            <SettingsField label="UPI ID" value={c.upi || ""} onChange={(v) => set("upi", v)} />
          </div>
        </SettingsSection>
      </div>

      <SettingsSection
        id="legal"
        title="Legal & registered address"
        description="GST, PAN, and address printed on tax invoices."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <SettingsField label="PAN" value={c.pan || ""} onChange={(v) => set("pan", v)} />
          <SettingsField label="GSTIN" value={c.gstin || ""} onChange={(v) => set("gstin", v)} />
          <SettingsField
            label="Registered address"
            value={c.address}
            onChange={(v) => set("address", v)}
            className="sm:col-span-2"
          />
        </div>
      </SettingsSection>

      <SettingsSection
        id="compliance"
        title="Compliance documents"
        description="Udyam / MSME, GST, PAN — files auto-save shortly after upload."
      >
        <ComplianceDocumentsPanel
          company={c}
          onUdyamUpload={handleUdyamPdf}
          onUdyamClear={() => set("udyamCertificateDataUrl", undefined)}
          onDocumentsChange={(docs) => {
            setC((prev) => ({
              ...prev,
              complianceDocuments: docs.length ? docs : undefined,
            }));
            setSaved(false);
          }}
        />
        <p className="mt-4 text-xs text-muted-foreground">
          Full archive also available under{" "}
          <Link to="/documents/company" className="text-primary hover:underline">
            Documents → Company
          </Link>
          .
        </p>
      </SettingsSection>

      <SettingsSection
        id="workspace"
        title="Workspace"
        description="Data storage, financial baseline, and quick links."
      >
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/10 p-4">
            {backendLabel.includes("Supabase") ? (
              <Cloud className="mt-0.5 h-5 w-5 shrink-0 text-sky-400" />
            ) : (
              <Database className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            )}
            <div>
              <p className="text-sm font-medium text-foreground">Data storage</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{backendLabel}</p>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-muted/10 p-4">
            <p className="text-sm font-medium text-foreground">Financial baseline</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Reconciled through {DEFAULT_FINANCIAL_BASELINE.asOfDate} —{" "}
              {DEFAULT_FINANCIAL_BASELINE.periodLabel}
            </p>
          </div>
        </div>

        <SettingsQuickLinks
          links={[
            {
              label: "Accounts",
              description: "Income, expenses, assets, and billing.",
              to: "/accounts",
            },
            {
              label: "Documents",
              description: "Invoices, payments, and company files.",
              to: "/documents",
            },
            {
              label: "Activity logs",
              description: "Audit trail of changes across the app.",
              to: "/logs",
            },
          ]}
        />

        <button
          type="button"
          onClick={handleSignOut}
          className="mt-6 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </SettingsSection>
    </form>
  );
}
