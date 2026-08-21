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
  ListChecks,
} from "lucide-react";
import { ComplianceDocumentsPanel } from "@/components/settings/ComplianceDocumentsPanel";
import { CompanyPartnersPanel } from "@/components/settings/CompanyPartnersPanel";
import { CloudUsagePanel } from "@/components/settings/CloudUsagePanel";
import { FormOptionsPanel } from "@/components/settings/FormOptionsPanel";
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
  | "formOptions"
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
  const contentRef = useRef<HTMLDivElement>(null);

  const tabGroups: {
    label: string;
    tabs: { value: SettingsTab; label: string; icon: React.ReactNode }[];
  }[] = [
    {
      label: "Business",
      tabs: [
        { value: "company", label: "Company Profile", icon: <Settings className="h-4 w-4" /> },
        { value: "invoice", label: "Invoice Defaults", icon: <FileText className="h-4 w-4" /> },
        { value: "tax", label: "Tax & Legal", icon: <Percent className="h-4 w-4" /> },
        { value: "bank", label: "Bank Details", icon: <CreditCard className="h-4 w-4" /> },
      ],
    },
    {
      label: "Operations",
      tabs: [
        { value: "finance", label: "Finance Rules", icon: <Sliders className="h-4 w-4" /> },
        { value: "formOptions", label: "Form Options", icon: <ListChecks className="h-4 w-4" /> },
      ],
    },
    {
      label: "People",
      tabs: [
        { value: "users", label: "Partners", icon: <Users className="h-4 w-4" /> },
        { value: "permissions", label: "Permissions", icon: <Key className="h-4 w-4" /> },
        { value: "security", label: "Security", icon: <Shield className="h-4 w-4" /> },
      ],
    },
    {
      label: "System",
      tabs: [
        { value: "storage", label: "Storage & Backups", icon: <Database className="h-4 w-4" /> },
        { value: "integrations", label: "Integrations", icon: <Cloud className="h-4 w-4" /> },
      ],
    },
  ];

  const flatTabs = tabGroups.flatMap((group) => group.tabs);
  const activeTabMeta = flatTabs.find((t) => t.value === activeTab) ?? flatTabs[0];

  const selectTab = (value: SettingsTab) => {
    setActiveTab(value);
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b border-border/80 px-4 py-3 sm:px-6 sm:py-3.5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              Settings
            </h1>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{activeTabMeta.label}</p>
          </div>
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 self-start rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 sm:self-auto"
          >
            <Save className="h-4 w-4" />
            {saved ? "Saved" : "Save"}
          </button>
        </div>

        {(syncing || loadError) && (
          <div
            className={`mt-3 rounded-lg border px-3 py-2 text-xs font-semibold ${
              loadError
                ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                : "border-border bg-muted/40 text-muted-foreground"
            }`}
          >
            {loadError ?? "Loading settings…"}
          </div>
        )}

        <div className="mt-3 md:hidden">
          <label className="sr-only" htmlFor="settings-section">
            Settings section
          </label>
          <select
            id="settings-section"
            value={activeTab}
            onChange={(e) => selectTab(e.target.value as SettingsTab)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-semibold text-foreground"
          >
            {tabGroups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.tabs.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-52 shrink-0 overflow-y-auto border-r border-border/80 md:block lg:w-56">
          <nav className="space-y-4 p-3" aria-label="Settings sections">
            {tabGroups.map((group) => (
              <div key={group.label}>
                <p className="mb-1 px-2.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {group.tabs.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => selectTab(t.value)}
                      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                        activeTab === t.value
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      }`}
                    >
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center opacity-80">
                        {t.icon}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <div
          ref={contentRef}
          className={
            activeTab === "formOptions"
              ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
              : "min-w-0 flex-1 overflow-y-auto"
          }
        >
          {activeTab === "formOptions" ? (
            <FormOptionsPanel company={c} onChange={set} />
          ) : (
          <div className="mx-auto max-w-3xl space-y-5 px-4 py-5 sm:px-6 sm:py-6">
            {activeTab === "company" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                  Company profile
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Name, contact, and logo used across invoices.
                </p>
              </div>
              <SettingsProfileHero
                company={c}
                logoPreview={logoPreview}
                onLogoUpload={handleImage("logoDataUrl")}
                onLogoClear={() => set("logoDataUrl", undefined)}
                onFieldChange={set}
              />
              <SettingsSection
                id="brand-panel"
                title="Invoice visuals"
                description="Elements stamped on generated PDFs."
              >
                <SettingsImageField
                  label="Signature / authorized stamp"
                  value={c.signatureDataUrl}
                  onChange={handleImage("signatureDataUrl")}
                  onClear={() => set("signatureDataUrl", undefined)}
                />
              </SettingsSection>
            </div>
          )}
            {activeTab === "invoice" && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                  Invoice defaults
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Prefill terms, notes, and payment mode on new invoices.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <SettingsField
                  label="Default payment terms"
                  value={c.paymentTerms || "50% at project start; remaining 50% before deployment."}
                  onChange={(v) => set("paymentTerms", v)}
                />
                <SettingsField
                  label="Standard remarks / notes"
                  value={c.remarks || "Thank you for your business!"}
                  onChange={(v) => set("remarks", v)}
                />
                <SettingsField
                  label="Default payment mode"
                  value={c.paymentMode || "Bank Transfer / UPI"}
                  onChange={(v) => set("paymentMode", v)}
                />
              </div>
            </div>
          )}
            {activeTab === "finance" && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-foreground">Finance rules</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Optional features for the whole workspace.
                </p>
              </div>
              <div className="divide-y divide-border/80 border-y border-border/80">
                <div className="flex items-start justify-between gap-4 py-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">Payment proof uploads</p>
                    <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
                      Show receipt uploads on income and expense forms.
                    </p>
                  </div>
                  <Switch
                    checked={c.paymentProofUploadsEnabled === true}
                    onCheckedChange={(checked) => set("paymentProofUploadsEnabled", checked)}
                    aria-label="Toggle payment proof uploads"
                    className="mt-0.5"
                  />
                </div>
                <div className="flex items-start justify-between gap-4 py-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">Company Valuation</p>
                    <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
                      Show Valuation under Insights. Keep off until ready.
                    </p>
                  </div>
                  <Switch
                    checked={c.companyValuationEnabled === true}
                    onCheckedChange={(checked) => set("companyValuationEnabled", checked)}
                    aria-label="Toggle Company Valuation module"
                    className="mt-0.5"
                  />
                </div>
                <div className="flex items-start justify-between gap-4 py-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">Project Assignments</p>
                    <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
                      Map people to projects on the Team page.
                    </p>
                  </div>
                  <Switch
                    checked={c.projectAssignmentsEnabled === true}
                    onCheckedChange={(checked) => set("projectAssignmentsEnabled", checked)}
                    aria-label="Toggle Project Assignments"
                    className="mt-0.5"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Save after changing rules.</p>
            </div>
          )}
            {activeTab === "tax" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                  Tax & legal
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Registrations and compliance documents for invoices.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <SettingsField
                  label="PAN number"
                  value={c.pan || ""}
                  onChange={(v) => set("pan", v)}
                />
                <SettingsField
                  label="GSTIN number"
                  value={c.gstin || ""}
                  onChange={(v) => set("gstin", v)}
                />
                <SettingsField
                  label="Registered office address"
                  value={c.address}
                  onChange={(v) => set("address", v)}
                  className="sm:col-span-2"
                />
              </div>
              <div className="space-y-3 border-t border-border/80 pt-5">
                <div>
                  <h3 className="text-sm font-medium text-foreground">Compliance PDFs</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Udyam and other certificates — open or download only.
                  </p>
                </div>
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
            {activeTab === "bank" && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                  Bank details
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Settlement info printed on invoices.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <SettingsField
                  label="Bank name"
                  value={c.bankName || ""}
                  onChange={(v) => set("bankName", v)}
                />
                <SettingsField
                  label="Account holder name"
                  value={c.accountName || ""}
                  onChange={(v) => set("accountName", v)}
                />
                <SettingsField
                  label="Account number"
                  value={c.accountNumber || ""}
                  onChange={(v) => set("accountNumber", v)}
                />
                <SettingsField
                  label="IFSC code"
                  value={c.ifsc || ""}
                  onChange={(v) => set("ifsc", v)}
                />
                <SettingsField
                  label="Branch location"
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
            {activeTab === "security" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                  Security & session
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Password and sign-out for this account.
                </p>
              </div>

              <div className="divide-y divide-border/80 border-y border-border/80">
                <div className="flex items-center justify-between gap-4 py-3.5 text-sm">
                  <span className="text-muted-foreground">Access role</span>
                  <span className="font-medium text-foreground">Owner / Admin</span>
                </div>
                <div className="flex items-center justify-between gap-4 py-3.5 text-sm">
                  <span className="text-muted-foreground">Encryption</span>
                  <span className="inline-flex items-center gap-1.5 font-medium text-emerald-500">
                    <CheckCircle className="h-3.5 w-3.5" />
                    RSA-2048
                  </span>
                </div>
              </div>

              <div className="space-y-4 border-t border-border/80 pt-5">
                <div>
                  <h3 className="text-sm font-medium text-foreground">Change password</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    8+ characters with upper, lower, and a number.
                  </p>
                </div>
                <form onSubmit={handleChangePassword} className="max-w-md space-y-3">
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

              <div className="border-t border-border/80 pt-5">
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex items-center gap-2 rounded-md border border-rose-500/25 px-3.5 py-2 text-xs font-medium text-rose-500 transition-colors hover:bg-rose-500/10"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </div>
          )}
            {activeTab === "storage" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                  Storage & backups
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Cloud usage, export, and restore.
                </p>
              </div>

              <CloudUsagePanel />

              <div className="flex items-start gap-3 border-y border-border/80 py-4">
                {backendLabel.includes("Supabase") ? (
                  <Cloud className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
                ) : (
                  <Database className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">Database</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {backendLabel}
                  </p>
                  {backendLabel.includes("Supabase") && backendReady != null && (
                    <p
                      className={`mt-1.5 text-xs ${backendReady ? "text-emerald-500" : "text-amber-500"}`}
                    >
                      {backendReady
                        ? "Connected to cloud tables."
                        : "Tables incomplete — run SQL setup in Supabase."}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-medium text-foreground">Backups</h3>
                <div className="divide-y divide-border/80 border-y border-border/80">
                  <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 max-w-md">
                      <p className="text-sm font-medium text-foreground">Export</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        Download invoices, operations, and settings as JSON.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleExportBackup}
                      className="shrink-0 text-xs"
                    >
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                      Export backup
                    </Button>
                  </div>
                  <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 max-w-md">
                      <p className="text-sm font-medium text-foreground">Restore</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        Upload a backup JSON. Replaces all current records.
                      </p>
                    </div>
                    <div className="relative shrink-0">
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleImportRestore}
                        disabled={restoring}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:opacity-50"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        disabled={restoring}
                      >
                        <Upload className="mr-1.5 h-3.5 w-3.5" />
                        {restoring ? "Restoring…" : "Upload backup"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3 border-t border-border/80 pt-5">
                <div>
                  <h3 className="text-sm font-medium text-foreground">Local → cloud sync</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Push browser-local settings and billing records to Supabase.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={syncingCloud}
                  onClick={handlePushLocalToCloud}
                  className="inline-flex items-center gap-2 rounded-md border border-border/80 px-3.5 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted/40 disabled:opacity-50"
                >
                  <Cloud className="h-4 w-4" />
                  {syncingCloud ? "Syncing…" : "Migrate local data to Supabase"}
                </button>
              </div>
            </div>
          )}
            {activeTab === "users" && (
            <CompanyPartnersPanel
              partners={partners}
              onAdd={addMember}
              onUpdate={updateMember}
              onRemove={removeMember}
            />
          )}
            {activeTab === "permissions" && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                  Permissions
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  What each role can do in this workspace.
                </p>
              </div>
              <div className="overflow-x-auto border-y border-border/80">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border/80 text-xs text-muted-foreground">
                      <th className="py-3 font-medium">Role</th>
                      <th className="py-3 font-medium">Read</th>
                      <th className="py-3 font-medium">Write</th>
                      <th className="py-3 font-medium">Settings</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    <tr>
                      <td className="py-3 font-medium text-foreground">Partner (Owner)</td>
                      <td className="py-3 text-emerald-500">Full</td>
                      <td className="py-3 text-emerald-500">Full</td>
                      <td className="py-3 text-emerald-500">Full</td>
                    </tr>
                    <tr>
                      <td className="py-3 font-medium text-foreground">Operator</td>
                      <td className="py-3 text-emerald-500">Full</td>
                      <td className="py-3 text-emerald-500">Full</td>
                      <td className="py-3 text-rose-500">None</td>
                    </tr>
                    <tr>
                      <td className="py-3 font-medium text-foreground">Auditor</td>
                      <td className="py-3 text-emerald-500">Full</td>
                      <td className="py-3 text-rose-500">None</td>
                      <td className="py-3 text-rose-500">None</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
            {activeTab === "integrations" && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                  Integrations
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Connected services for this workspace.
                </p>
              </div>
              <div className="divide-y divide-border/80 border-y border-border/80">
                <div className="flex items-start justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Vercel deployments</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Syncs letterhead logos and PDF assets with edge builds.
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-amber-500">Configured</span>
                </div>
                <div className="flex items-start justify-between gap-4 py-4 opacity-60">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Slack webhooks</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Notify channels when invoices go overdue.
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">Inactive</span>
                </div>
              </div>
            </div>
          )}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}

