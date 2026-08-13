import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  Cloud,
  Database,
  LogOut,
  Save,
  Users,
  Settings,
  FileText,
  Percent,
  CreditCard,
  Shield,
  Download,
  Upload,
  Key,
  Sliders,
  CheckCircle,
} from "lucide-react";
import { ComplianceDocumentsPanel } from "@/components/settings/ComplianceDocumentsPanel";
import { CompanyPartnersPanel } from "@/components/settings/CompanyPartnersPanel";
import { CloudUsagePanel } from "@/components/settings/CloudUsagePanel";
import {
  SettingsField,
  SettingsImageField,
  SettingsProfileHero,
  SettingsSection,
} from "@/components/settings/settings-ui";
import { DEFAULT_COMPANY, DEFAULT_PUBLIC_LOGO_URL } from "@/lib/constants";
import { companyLogoSrc } from "@/lib/company-branding";
import { logClientError } from "@/lib/client-logger";
import { readAndPersistFile } from "@/lib/remote-file";
import { loadDocuments, saveDocuments } from "@/lib/documents-storage";
import { loadActivityLogs, replaceActivityLogs } from "@/lib/activity-log-storage";
import { DEFAULT_FINANCIAL_BASELINE } from "@/lib/default-financial-baseline";
import { loadCompany, normalizeCompanySettings, saveCompany, upsertInvoice } from "@/lib/storage";
import { getDataBackendStatus } from "@/server/invoice-fns";
import { setServerApiConfigured } from "@/lib/backend-status-cache";
import { getBackendHealthFn } from "@/server/backend-health-fns";
import { pushLocalDataToCloud, hasLocalDataToSync } from "@/lib/sync-to-cloud";
import { logoutFn, changePasswordFn } from "@/server/auth-fns";
import { useOperations } from "@/hooks/use-operations";
import { useInvoices } from "@/hooks/use-invoices";
import { useCompany } from "@/hooks/use-company";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import type { CompanyMember, CompanySettings, Invoice } from "@/lib/types";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

type SettingsTab =
  | "company"
  | "invoice"
  | "finance"
  | "tax"
  | "bank"
  | "security"
  | "storage"
  | "users"
  | "permissions"
  | "integrations";

function SettingsPage() {
  const router = useRouter();
  const { ops, persist } = useOperations();
  const { invoices, setInvoices } = useInvoices();
  const { invalidate: invalidateCompany } = useCompany();

  const [activeTab, setActiveTab] = useState<SettingsTab>("company");
  const [c, setC] = useState<CompanySettings>(() => normalizeCompanySettings(DEFAULT_COMPANY));
  const [syncing, setSyncing] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Storage and Sync states
  const [backendLabel, setBackendLabel] = useState<string>("Checking storage…");
  const [backendReady, setBackendReady] = useState<boolean | null>(null);
  const [backendErrors, setBackendErrors] = useState<string[]>([]);
  const [syncingCloud, setSyncingCloud] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [changingPassword, setChangingPassword] = useState(false);

  const latestRef = useRef<CompanySettings | null>(null);
  latestRef.current = c;

  const complianceSig =
    c != null
      ? `${c.udyamCertificateDataUrl?.length ?? 0}:${(c.complianceDocuments ?? []).length}:${(
          c.complianceDocuments ?? []
        )
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
      .then((s) => {
        setServerApiConfigured(s.configured);
        setBackendLabel(
          s.configured
            ? "Supabase Cloud — synced across devices"
            : "Browser localStorage — this device only",
        );
      })
      .catch(() => setBackendLabel("Storage status unknown"));
    void getBackendHealthFn()
      .then((health) => {
        setBackendReady(health.ready);
        setBackendErrors("errors" in health && health.errors ? health.errors : []);
      })
      .catch(() => {
        setBackendReady(null);
        setBackendErrors([]);
      });
  }, []);

  // Auto-save compliance files shortly after changes
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
          alert(err instanceof Error ? err.message : "Could not save compliance document.");
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
      void readAndPersistFile(file, `company/${key === "logoDataUrl" ? "logo" : "signature"}`)
        .then(({ url }) => {
          setC((prev) => ({ ...prev, [key]: url }));
          setSaved(false);
        })
        .catch((err) => {
          logClientError("settings.imageUpload", err);
          alert(err instanceof Error ? err.message : "Could not upload image.");
        });
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
    void readAndPersistFile(file, "company/udyam")
      .then(({ url }) => {
        setC((prev) => ({ ...prev, udyamCertificateDataUrl: url }));
        setSaved(false);
        e.target.value = "";
      })
      .catch((err) => {
        logClientError("settings.udyamUpload", err);
        alert(err instanceof Error ? err.message : "Could not upload PDF.");
        e.target.value = "";
      });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cur = latestRef.current;
    if (!cur) return;
    void saveCompany(cur)
      .then(() => {
        void invalidateCompany();
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      })
      .catch((err) => {
        logClientError("settings.save", err);
        alert(err instanceof Error ? err.message : "Could not save settings.");
      });
  };

  const handlePushLocalToCloud = () => {
    if (!hasLocalDataToSync()) {
      alert("No local browser data found to upload.");
      return;
    }
    if (
      !confirm(
        "Upload all browser data to Supabase? This overwrites cloud copies with your local data.",
      )
    ) {
      return;
    }
    setSyncingCloud(true);
    void pushLocalDataToCloud()
      .then(({ synced }) => {
        alert(`Synced to Supabase:\n• ${synced.join("\n• ")}`);
        return getBackendHealthFn();
      })
      .then((health) => {
        setBackendReady(health.ready);
        setBackendErrors("errors" in health && health.errors ? health.errors : []);
      })
      .catch((err) => {
        logClientError("settings.syncToCloud", err);
        alert(err instanceof Error ? err.message : "Cloud sync failed.");
      })
      .finally(() => setSyncingCloud(false));
  };

  // BACKUP & RESTORE UTILITIES
  const handleExportBackup = async () => {
    try {
      const [documents, activityLogs] = await Promise.all([loadDocuments(), loadActivityLogs()]);
      const exportedAt = new Date().toISOString();
      const backupData = {
        format: "admark-os-full-system-backup",
        version: "2.0",
        metadata: {
          exportedAt,
          application: "Admark OS",
          organization: c.name,
          description:
            "Complete system backup. All operational, financial, CRM, document, calendar, settings, and invoice records are included.",
        },
        manifest: {
          companySettings: 1,
          invoices: invoices.length,
          clients: ops.clients?.length ?? 0,
          leads: ops.leads?.length ?? 0,
          projects: ops.projects?.length ?? 0,
          transactions: ops.transactions?.length ?? 0,
          expenses: ops.expenses?.length ?? 0,
          payments: ops.payments?.length ?? 0,
          partnerships: ops.partnerships?.length ?? 0,
          founders: ops.founders?.length ?? 0,
          scheduleEvents: ops.scheduleEvents?.length ?? 0,
          fixedMonthlyExpenses: ops.fixedMonthlyExpenses?.length ?? 0,
          agreements: documents.agreements?.length ?? 0,
          activityLogs: activityLogs.length,
          valuationSnapshots: ops.valuationSnapshots?.length ?? 0,
          valuationAuditEntries: ops.valuationAudit?.length ?? 0,
        },
        data: {
          companySettings: c,
          invoices,
          operations: ops,
          documents,
          activityLogs,
        },
      };
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `admark_agency_os_backup_${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Failed to export backup data.");
    }
  };

  const handleImportRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        setRestoring(true);
        const data = JSON.parse(event.target?.result as string);
        // v2 stores records under `data`; v1 remains supported for old backups.
        const operations = data.data?.operations ?? data.ops;
        const restoredInvoices = data.data?.invoices ?? data.invoices;
        const companySettings = data.data?.companySettings ?? data.company;
        const documents = data.data?.documents;
        const activityLogs = data.data?.activityLogs;
        if (!operations || !Array.isArray(restoredInvoices)) {
          alert("Invalid backup file format. Operations and invoices data are required.");
          return;
        }

        if (
          confirm(
            "WARNING: Importing this backup will overwrite ALL current local and cloud database records. Proceed?",
          )
        ) {
          // Safety net: download a pre-restore snapshot of the live system so an
          // interrupted or bad import can still be undone manually.
          try {
            const preRestore = {
              version: 2,
              exportedAt: new Date().toISOString(),
              purpose: "pre-restore-safety-snapshot",
              data: {
                companySettings: c,
                invoices,
                operations: ops,
                documents: await loadDocuments(),
                activityLogs: await loadActivityLogs(),
              },
            };
            const blob = new Blob([JSON.stringify(preRestore, null, 2)], {
              type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `admark_pre_restore_${new Date().toISOString().slice(0, 10)}.json`;
            link.click();
            URL.revokeObjectURL(url);
          } catch (backupError) {
            logClientError("settings.preRestoreBackup", backupError);
            if (
              !confirm(
                "Could not create a pre-restore safety backup. Continue with restore anyway?",
              )
            ) {
              return;
            }
          }

          // 1. Restore Operations (Clients, Leads, Expenses, Projects, Partnerships)
          await persist(operations, { allowAllDeletes: true });

          // 2. Restore Invoices
          const invoicesToRestore: Invoice[] = restoredInvoices;
          for (const inv of invoicesToRestore) {
            await upsertInvoice(inv);
          }
          setInvoices(invoicesToRestore);

          // 3. Restore Company Branding
          if (companySettings) {
            setC(companySettings);
            await saveCompany(companySettings);
          }

          // 4. Restore document repository and activity history (v2 backups).
          if (documents) await saveDocuments(documents, { allowAllDeletes: true });
          if (Array.isArray(activityLogs)) await replaceActivityLogs(activityLogs);

          alert("Success! System backup restored successfully. Reloading route context...");
          router.invalidate();
        }
      } catch (err) {
        alert("Failed to parse JSON backup. Check file integrity.");
      } finally {
        setRestoring(false);
        e.target.value = "";
      }
    };
    reader.readAsText(file);
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
        {
          id,
          name: "",
          email: "",
          phone: "",
          role: "Partner",
          memberType: "founder",
          status: "active",
        },
      ],
    }));
    setSaved(false);
  };

  const handleSignOut = () => {
    void logoutFn()
      .then(() => router.navigate({ to: "/login", replace: true, search: { redirect: undefined } }))
      .catch((e) => logClientError("settings.signOut", e));
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordForm.currentPassword || !passwordForm.newPassword) {
      toast.error("Enter your current and new password.");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("New password and confirmation do not match.");
      return;
    }
    setChangingPassword(true);
    void changePasswordFn({
      data: {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      },
    })
      .then(() => {
        toast.success("Password updated.");
        setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      })
      .catch((err) => {
        logClientError("settings.changePassword", err);
        toast.error(err instanceof Error ? err.message : "Could not change password.");
      })
      .finally(() => setChangingPassword(false));
  };

  const partners = (c.companyMembers ?? []).filter((member) => member.memberType === "founder");
  const logoPreview = companyLogoSrc(c) || DEFAULT_PUBLIC_LOGO_URL;

  // Sidebar Tabs Config
  const tabsList: { value: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { value: "company", label: "Company Profile", icon: <Settings className="h-4 w-4" /> },
    { value: "invoice", label: "Invoice Settings", icon: <FileText className="h-4 w-4" /> },
    { value: "finance", label: "Finance Rules", icon: <CreditCard className="h-4 w-4" /> },
    { value: "tax", label: "Tax Configuration", icon: <Percent className="h-4 w-4" /> },
    { value: "bank", label: "Bank Details", icon: <CreditCard className="h-4 w-4" /> },
    { value: "security", label: "Security & Access", icon: <Shield className="h-4 w-4" /> },
    { value: "storage", label: "Storage & Backups", icon: <Database className="h-4 w-4" /> },
    { value: "users", label: "Users & Members", icon: <Users className="h-4 w-4" /> },
    { value: "permissions", label: "Permissions Matrix", icon: <Key className="h-4 w-4" /> },
    { value: "integrations", label: "Integrations", icon: <Sliders className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-5">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
            Workspace Configuration
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure system rules, legal settings, database engines, and backup archives.
          </p>
        </div>
        <button
          onClick={handleSave}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
        >
          <Save className="h-4 w-4" />
          {saved ? "Saved Settings!" : "Save Changes"}
        </button>
      </div>

      {(syncing || loadError) && (
        <div
          className={`rounded-lg border px-4 py-2.5 text-xs font-semibold ${
            loadError
              ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
              : "border-border bg-muted/40 text-muted-foreground"
          }`}
        >
          {loadError ?? "Verifying local state configurations…"}
        </div>
      )}

      {/* Main split grid */}
      <div className="grid items-start gap-6 md:grid-cols-[15.5rem_minmax(0,1fr)]">
        {/* Left Sidebar Tab Navigation */}
        <aside className="space-y-1 rounded-xl border border-border bg-card/65 p-2">
          {tabsList.map((t) => (
            <button
              key={t.value}
              onClick={() => setActiveTab(t.value)}
              className={`flex w-full items-center justify-start gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold leading-snug transition-all ${
                activeTab === t.value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">{t.icon}</span>
              <span className="min-w-0 flex-1 whitespace-nowrap">{t.label}</span>
            </button>
          ))}
        </aside>

        {/* Right Active Panel */}
        <div className="min-w-0 rounded-xl border border-border bg-card p-6 shadow-sm min-h-[500px]">
          {/* Tab: Company Profile (includes branding assets) */}
          {activeTab === "company" && (
            <div className="space-y-6">
              <h2 className="text-base font-bold text-foreground flex items-center gap-2 border-b border-border pb-3">
                Company Profile
              </h2>
              <SettingsProfileHero
                company={c}
                logoPreview={logoPreview}
                onLogoUpload={handleImage("logoDataUrl")}
                onLogoClear={() => set("logoDataUrl", undefined)}
                onFieldChange={set}
              />
              {/* Logo upload lives in the profile hero above — only the signature stamp here. */}
              <SettingsSection
                id="brand-panel"
                title="Invoice Visuals"
                description="Upload elements stamped on generated PDFs."
              >
                <div className="grid gap-4 mt-4">
                  <SettingsImageField
                    label="Signature Authorized Stamp"
                    value={c.signatureDataUrl}
                    onChange={handleImage("signatureDataUrl")}
                    onClear={() => set("signatureDataUrl", undefined)}
                  />
                </div>
              </SettingsSection>
            </div>
          )}

          {/* Tab: Invoice Settings */}
          {activeTab === "invoice" && (
            <div className="space-y-6">
              <h2 className="text-base font-bold text-foreground border-b border-border pb-3">
                Invoice Defaults
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <SettingsField
                  label="Default Payment Terms"
                  value={c.paymentTerms || "50% at project start; remaining 50% before deployment."}
                  onChange={(v) => set("paymentTerms", v)}
                />
                <SettingsField
                  label="Standard Remarks / Notes"
                  value={c.remarks || "Thank you for your business!"}
                  onChange={(v) => set("remarks", v)}
                />
                <SettingsField
                  label="Default Payment Mode"
                  value={c.paymentMode || "Bank Transfer / UPI"}
                  onChange={(v) => set("paymentMode", v)}
                />
              </div>
            </div>
          )}

          {/* Tab: Finance Rules */}
          {activeTab === "finance" && (
            <div className="space-y-6">
              <h2 className="border-b border-border pb-3 text-base font-bold text-foreground">
                Finance Entry Rules
              </h2>
              <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-muted/10 p-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">Payment proof uploads</p>
                  <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
                    Show image/PDF receipt uploads while adding income and expenses. Disabled by
                    default; financial entries can be saved without screenshots.
                  </p>
                </div>
                <Switch
                  checked={c.paymentProofUploadsEnabled === true}
                  onCheckedChange={(checked) => set("paymentProofUploadsEnabled", checked)}
                  aria-label="Toggle payment proof uploads"
                  className="mt-0.5"
                />
              </div>
              <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-muted/10 p-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">Company Valuation module</p>
                  <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
                    Show Company Valuation under Insights and allow access to the module. Keep this
                    disabled until the feature is ready for use.
                  </p>
                </div>
                <Switch
                  checked={c.companyValuationEnabled === true}
                  onCheckedChange={(checked) => set("companyValuationEnabled", checked)}
                  aria-label="Toggle Company Valuation module"
                  className="mt-0.5"
                />
              </div>
              <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-muted/10 p-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">Project Assignments</p>
                  <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
                    Show Project Assignments on the Team page so you can map people to projects.
                    Leave this off until you need that workflow.
                  </p>
                </div>
                <Switch
                  checked={c.projectAssignmentsEnabled === true}
                  onCheckedChange={(checked) => set("projectAssignmentsEnabled", checked)}
                  aria-label="Toggle Project Assignments"
                  className="mt-0.5"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Payment proof uploads:{" "}
                <span className="font-semibold text-foreground">
                  {c.paymentProofUploadsEnabled ? "Enabled" : "Disabled"}
                </span>
                {" · "}Company Valuation:{" "}
                <span className="font-semibold text-foreground">
                  {c.companyValuationEnabled ? "Enabled" : "Disabled"}
                </span>
                {" · "}Project Assignments:{" "}
                <span className="font-semibold text-foreground">
                  {c.projectAssignmentsEnabled ? "Enabled" : "Disabled"}
                </span>
                . Use “Save Changes” after updating these rules.
              </p>
            </div>
          )}

          {/* Tab: Tax Configuration */}
          {activeTab === "tax" && (
            <div className="space-y-6">
              <h2 className="text-base font-bold text-foreground border-b border-border pb-3">
                Tax & Legal Registrations
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <SettingsField
                  label="PAN Number"
                  value={c.pan || ""}
                  onChange={(v) => set("pan", v)}
                />
                <SettingsField
                  label="GSTIN Number"
                  value={c.gstin || ""}
                  onChange={(v) => set("gstin", v)}
                />
                <SettingsField
                  label="Registered Office Address"
                  value={c.address}
                  onChange={(v) => set("address", v)}
                  className="sm:col-span-2"
                />
              </div>
              <div className="mt-6 border-t border-border pt-4">
                <h3 className="text-xs font-bold text-muted-foreground uppercase mb-3">
                  Compliance PDFs
                </h3>
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
              </div>
            </div>
          )}

          {/* Tab: Bank Details */}
          {activeTab === "bank" && (
            <div className="space-y-6">
              <h2 className="text-base font-bold text-foreground border-b border-border pb-3">
                Bank Account Settlements
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <SettingsField
                  label="Bank Name"
                  value={c.bankName || ""}
                  onChange={(v) => set("bankName", v)}
                />
                <SettingsField
                  label="Account Holder Name"
                  value={c.accountName || ""}
                  onChange={(v) => set("accountName", v)}
                />
                <SettingsField
                  label="Account Number"
                  value={c.accountNumber || ""}
                  onChange={(v) => set("accountNumber", v)}
                />
                <SettingsField
                  label="IFSC Code"
                  value={c.ifsc || ""}
                  onChange={(v) => set("ifsc", v)}
                />
                <SettingsField
                  label="Branch Location"
                  value={c.branch || ""}
                  onChange={(v) => set("branch", v)}
                />
                <SettingsField
                  label="UPI ID / VPA"
                  value={c.upi || ""}
                  onChange={(v) => set("upi", v)}
                />
              </div>
            </div>
          )}

          {/* Tab: Security */}
          {activeTab === "security" && (
            <div className="space-y-6">
              <h2 className="text-base font-bold text-foreground border-b border-border pb-3">
                Security & Session
              </h2>
              <div className="rounded-lg border border-border/80 bg-muted/10 p-4 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground font-semibold">
                    Active User Access Role:
                  </span>
                  <span className="bg-primary/10 text-primary font-bold px-2 py-0.5 rounded">
                    Owner / Admin
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground font-semibold">
                    Encryption Key Status:
                  </span>
                  <span className="text-emerald-500 font-bold flex items-center gap-1">
                    <CheckCircle className="h-3.5 w-3.5" /> RSA-2048 Activated
                  </span>
                </div>
              </div>

              <div className="space-y-4 rounded-lg border border-border p-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Change password</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Enter your current password, then choose a new one (8+ characters with upper,
                    lower, and a number).
                  </p>
                </div>
                <form onSubmit={handleChangePassword} className="space-y-3 max-w-md">
                  <SettingsField
                    label="Current password"
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(v) => setPasswordForm((f) => ({ ...f, currentPassword: v }))}
                  />
                  <SettingsField
                    label="New password"
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(v) => setPasswordForm((f) => ({ ...f, newPassword: v }))}
                  />
                  <SettingsField
                    label="Confirm new password"
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(v) => setPasswordForm((f) => ({ ...f, confirmPassword: v }))}
                  />
                  <Button type="submit" disabled={changingPassword}>
                    {changingPassword ? "Updating…" : "Update password"}
                  </Button>
                </form>
              </div>

              <div className="border-t border-border pt-4">
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex items-center gap-2 rounded-lg border border-rose-500/30 px-4 py-2 text-xs font-bold text-rose-500 hover:bg-rose-500/10 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Terminate Admin Session (Sign out)
                </button>
              </div>
            </div>
          )}

          {/* Tab: Storage & Backups */}
          {activeTab === "storage" && (
            <div className="space-y-6">
              <h2 className="text-base font-bold text-foreground border-b border-border pb-3">
                Storage & Backups
              </h2>
              <CloudUsagePanel />
              <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/15 p-4">
                {backendLabel.includes("Supabase") ? (
                  <Cloud className="mt-0.5 h-5 w-5 shrink-0 text-sky-400" />
                ) : (
                  <Database className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">Active Database Engine</p>
                  <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                    {backendLabel}
                  </p>
                  {backendLabel.includes("Supabase") && backendReady != null && (
                    <p
                      className={`mt-2 text-xs font-semibold ${backendReady ? "text-emerald-500" : "text-amber-500"}`}
                    >
                      {backendReady
                        ? "Cloud Synced — connected to cloud tables."
                        : "Tables configuration incomplete. Run SQL setup in Supabase dashboard."}
                    </p>
                  )}
                </div>
              </div>

              <h3 className="text-xs font-bold text-muted-foreground uppercase border-t border-border pt-5">
                Backups & Disaster Recovery
              </h3>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* Export Card */}
                <div className="rounded-xl border border-border bg-muted/10 p-4 space-y-3">
                  <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Download className="h-4 w-4 text-primary" /> Export System Backup
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Download your entire application state (invoices, operations, and settings) as a
                    structured JSON file.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleExportBackup}
                    className="w-full text-xs font-bold"
                  >
                    Export Backup File
                  </Button>
                </div>

                {/* Import Card */}
                <div className="rounded-xl border border-border bg-muted/10 p-4 space-y-3">
                  <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Upload className="h-4 w-4 text-indigo-500" /> Import / Restore Backup
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Restore data from a JSON file. WARNING: This completely replaces all current
                    records.
                  </p>
                  <div className="relative">
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImportRestore}
                      disabled={restoring}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:opacity-50"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-xs font-bold text-indigo-500 hover:bg-indigo-500/10"
                    >
                      {restoring ? "Restoring..." : "Upload Backup File"}
                    </Button>
                  </div>
                </div>
              </div>

              {/* LocalStorage Migrations */}
              <div className="border-t border-border pt-5 space-y-3">
                <h3 className="text-xs font-bold text-muted-foreground uppercase">
                  localstorage Cloud Sync
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Migrate settings and client billing records previously entered in your browser
                  session to Supabase database.
                </p>
                <button
                  type="button"
                  disabled={syncingCloud}
                  onClick={handlePushLocalToCloud}
                  className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-xs font-bold text-primary transition-colors hover:bg-primary/15 disabled:opacity-50"
                >
                  <Cloud className="h-4 w-4" />
                  {syncingCloud ? "Syncing data..." : "Migrate local data to Supabase"}
                </button>
              </div>
            </div>
          )}

          {/* Tab: Users — contact + equity ledger merged per partner */}
          {activeTab === "users" && (
            <CompanyPartnersPanel
              partners={partners}
              onAdd={addMember}
              onUpdate={updateMember}
              onRemove={removeMember}
            />
          )}

          {/* Tab: Permissions */}
          {activeTab === "permissions" && (
            <div className="space-y-6">
              <h2 className="text-base font-bold text-foreground border-b border-border pb-3">
                Permissions Matrix
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground uppercase font-bold">
                      <th className="py-2">Role</th>
                      <th className="py-2">Read Access</th>
                      <th className="py-2">Write Access</th>
                      <th className="py-2">Settings Access</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    <tr>
                      <td className="py-2.5 font-bold text-foreground">Partner (Owner)</td>
                      <td className="py-2.5 text-emerald-500 font-semibold">Full</td>
                      <td className="py-2.5 text-emerald-500 font-semibold">Full</td>
                      <td className="py-2.5 text-emerald-500 font-semibold">Full</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 font-bold text-foreground">Operator</td>
                      <td className="py-2.5 text-emerald-500 font-semibold">Full</td>
                      <td className="py-2.5 text-emerald-500 font-semibold">Full</td>
                      <td className="py-2.5 text-rose-500 font-semibold">None</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 font-bold text-foreground">Auditor</td>
                      <td className="py-2.5 text-emerald-500 font-semibold">Full</td>
                      <td className="py-2.5 text-rose-500 font-semibold">None</td>
                      <td className="py-2.5 text-rose-500 font-semibold">None</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab: Integrations */}
          {activeTab === "integrations" && (
            <div className="space-y-6">
              <h2 className="text-base font-bold text-foreground border-b border-border pb-3">
                API & Integrations
              </h2>
              <div className="space-y-4">
                <div className="rounded-lg border border-border p-4 bg-muted/10 space-y-2">
                  <div className="flex justify-between items-center text-xs font-bold text-foreground">
                    <span>Vercel Deployments</span>
                    <span className="bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded text-[10px]">
                      Configured
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-normal">
                    Automatically syncs letterhead logos and PDF assets with edge build paths.
                  </p>
                </div>
                <div className="rounded-lg border border-border p-4 bg-muted/10 space-y-2 opacity-65">
                  <div className="flex justify-between items-center text-xs font-bold text-foreground">
                    <span>Slack Webhooks</span>
                    <span className="bg-muted text-muted-foreground px-2 py-0.5 rounded text-[10px]">
                      Inactive
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-normal">
                    Sends automated warning updates directly to operational channels when invoices
                    go overdue.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
