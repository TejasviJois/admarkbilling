import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Copy, Eye, EyeOff, KeyRound, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  OperationsLoading,
  OperationsPageHeader,
} from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";
import {
  CREDENTIAL_CATEGORIES,
  buildDefaultCredentialEntries,
  credentialSearchHaystack,
  newCredentialId,
  sortCredentials,
} from "@/lib/credential-vault";
import type { CredentialCategory, CredentialEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/credentials")({ component: CredentialsPage });

type CredentialForm = {
  category: CredentialCategory;
  service: string;
  email: string;
  username: string;
  password: string;
  linkedTo: string;
  otpMethod: string;
  notes: string;
};

const EMPTY_FORM: CredentialForm = {
  category: "Other",
  service: "",
  email: "",
  username: "",
  password: "",
  linkedTo: "",
  otpMethod: "",
  notes: "",
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

function formFromEntry(entry: CredentialEntry): CredentialForm {
  return {
    category: entry.category,
    service: entry.service,
    email: entry.email ?? "",
    username: entry.username ?? "",
    password: entry.password ?? "",
    linkedTo: entry.linkedTo ?? "",
    otpMethod: entry.otpMethod ?? "",
    notes: entry.notes ?? "",
  };
}

function CredentialsPage() {
  const { ops, persist, loading, ready } = useOperations();
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CredentialCategory | "all">("all");
  const [revealedIds, setRevealedIds] = useState<Set<string>>(() => new Set());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CredentialEntry | null>(null);
  const [form, setForm] = useState<CredentialForm>(EMPTY_FORM);
  const [showFormPassword, setShowFormPassword] = useState(false);

  const credentials = ops.credentials ?? [];

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortCredentials(
      credentials.filter((entry) => {
        if (categoryFilter !== "all" && entry.category !== categoryFilter) return false;
        if (!q) return true;
        return credentialSearchHaystack(entry).includes(q);
      }),
    );
  }, [credentials, query, categoryFilter]);

  const countsByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of credentials) {
      counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
    }
    return counts;
  }, [credentials]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowFormPassword(false);
    setDialogOpen(true);
  };

  const openEdit = (entry: CredentialEntry) => {
    setEditing(entry);
    setForm(formFromEntry(entry));
    setShowFormPassword(false);
    setDialogOpen(true);
  };

  const saveEntry = () => {
    const service = form.service.trim();
    if (!service) {
      toast.error("Service name is required.");
      return;
    }
    const now = new Date().toISOString();
    const nextEntry: CredentialEntry = {
      id: editing?.id ?? newCredentialId(),
      category: form.category,
      service,
      email: form.email.trim() || undefined,
      username: form.username.trim() || undefined,
      password: form.password || undefined,
      linkedTo: form.linkedTo.trim() || undefined,
      otpMethod: form.otpMethod.trim() || undefined,
      notes: form.notes.trim() || undefined,
      updatedAt: now,
    };
    const next = editing
      ? credentials.map((entry) => (entry.id === editing.id ? nextEntry : entry))
      : [...credentials, nextEntry];
    void persist({ ...ops, credentials: next });
    setDialogOpen(false);
    toast.success(editing ? "Credential updated" : "Credential added");
  };

  const removeEntry = (id: string) => {
    if (!confirm("Remove this credential from the vault?")) return;
    void persist(
      { ...ops, credentials: credentials.filter((entry) => entry.id !== id) },
      { deleteIds: { credentials: [id] } },
    );
  };

  const importDefaults = () => {
    if (credentials.length > 0) {
      if (
        !confirm(
          `Replace all ${credentials.length} vault entries with the Admark starter set?`,
        )
      ) {
        return;
      }
    }
    const seeded = buildDefaultCredentialEntries();
    const options =
      credentials.length > 0
        ? {
            deleteIds: { credentials: credentials.map((entry) => entry.id) },
          }
        : undefined;
    void persist({ ...ops, credentials: seeded }, options);
    toast.success(`Loaded ${seeded.length} credentials into the vault`);
  };

  const handleCopy = async (key: string, value: string | undefined, label: string) => {
    if (!value) {
      toast.error(`No ${label} to copy.`);
      return;
    }
    const ok = await copyText(value);
    if (!ok) {
      toast.error("Could not copy to clipboard.");
      return;
    }
    setCopiedKey(key);
    toast.success(`Copied ${label}`);
    window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 2000);
  };

  const toggleReveal = (id: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading && !ready) return <OperationsLoading />;

  return (
    <div className="space-y-6">
      <OperationsPageHeader
        title="Credentials"
        description="Company emails, service logins, and OTP contacts. Visible only after you sign in to Admark."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {credentials.length === 0 ? (
              <Button type="button" size="sm" variant="outline" onClick={importDefaults}>
                <KeyRound className="h-4 w-4" />
                Load Admark accounts
              </Button>
            ) : null}
            <Button type="button" size="sm" className="h-10 gap-1.5 rounded-lg px-4" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Add credential
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search service, email, username…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCategoryFilter("all")}
            className={cn(
              "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
              categoryFilter === "all"
                ? "border-primary/40 bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            All ({credentials.length})
          </button>
          {CREDENTIAL_CATEGORIES.filter((category) => (countsByCategory.get(category) ?? 0) > 0).map(
            (category) => (
              <button
                key={category}
                type="button"
                onClick={() => setCategoryFilter(category)}
                className={cn(
                  "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                  categoryFilter === category
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {category} ({countsByCategory.get(category) ?? 0})
              </button>
            ),
          )}
        </div>
      </div>

      {credentials.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <KeyRound className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            No credentials yet. Load the Admark account set or add one manually.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={importDefaults}>
              Load Admark accounts
            </Button>
            <Button type="button" size="sm" onClick={openCreate}>
              Add credential
            </Button>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[64rem] table-auto border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Service</th>
                  <th className="px-4 py-3">Email / ID</th>
                  <th className="px-4 py-3">Username</th>
                  <th className="px-4 py-3">Password</th>
                  <th className="px-4 py-3">Linked to</th>
                  <th className="px-4 py-3">OTP</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                      No credentials match this filter.
                    </td>
                  </tr>
                ) : (
                  visible.map((entry) => {
                    const revealed = revealedIds.has(entry.id);
                    return (
                      <tr key={entry.id} className="hover:bg-muted/30">
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {entry.category}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                          {entry.service}
                        </td>
                        <td className="max-w-[14rem] px-4 py-3 text-muted-foreground break-all">
                          <div className="flex items-center gap-1">
                            <span className="min-w-0 flex-1">{entry.email || "—"}</span>
                            {entry.email ? (
                              <button
                                type="button"
                                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                onClick={() =>
                                  void handleCopy(`${entry.id}-email`, entry.email, "email")
                                }
                                title="Copy email"
                              >
                                {copiedKey === `${entry.id}-email` ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </button>
                            ) : null}
                          </div>
                        </td>
                        <td className="max-w-[10rem] px-4 py-3 text-muted-foreground break-words">
                          {entry.username || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-xs text-foreground">
                              {entry.password
                                ? revealed
                                  ? entry.password
                                  : "••••••••"
                                : "—"}
                            </span>
                            {entry.password ? (
                              <>
                                <button
                                  type="button"
                                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                  onClick={() => toggleReveal(entry.id)}
                                  title={revealed ? "Hide password" : "Show password"}
                                >
                                  {revealed ? (
                                    <EyeOff className="h-3.5 w-3.5" />
                                  ) : (
                                    <Eye className="h-3.5 w-3.5" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                  onClick={() =>
                                    void handleCopy(
                                      `${entry.id}-password`,
                                      entry.password,
                                      "password",
                                    )
                                  }
                                  title="Copy password"
                                >
                                  {copiedKey === `${entry.id}-password` ? (
                                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              </>
                            ) : null}
                          </div>
                        </td>
                        <td className="max-w-[12rem] px-4 py-3 text-xs text-muted-foreground break-all">
                          {entry.linkedTo || "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                          {entry.otpMethod || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => openEdit(entry)}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeEntry(entry.id)}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-400"
                              title="Remove"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit credential" : "Add credential"}</DialogTitle>
            <DialogDescription>
              Store service login details for the team. Passwords stay hidden in the table until
              revealed.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label>Category</Label>
              <Select
                value={form.category}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, category: value as CredentialCategory }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CREDENTIAL_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cred-service">Service</Label>
              <Input
                id="cred-service"
                value={form.service}
                onChange={(e) => setForm((prev) => ({ ...prev, service: e.target.value }))}
                placeholder="Google, GitHub, AWS…"
              />
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="cred-email">Email / ID</Label>
                <Input
                  id="cred-email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="cred-username">Username</Label>
                <Input
                  id="cred-username"
                  value={form.username}
                  onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cred-password">Password</Label>
              <div className="relative">
                <Input
                  id="cred-password"
                  type={showFormPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowFormPassword((prev) => !prev)}
                >
                  {showFormPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="cred-linked">Linked to</Label>
                <Input
                  id="cred-linked"
                  value={form.linkedTo}
                  onChange={(e) => setForm((prev) => ({ ...prev, linkedTo: e.target.value }))}
                  placeholder="Phone or recovery email"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="cred-otp">OTP method</Label>
                <Input
                  id="cred-otp"
                  value={form.otpMethod}
                  onChange={(e) => setForm((prev) => ({ ...prev, otpMethod: e.target.value }))}
                  placeholder="Mobile, G - Auth…"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cred-notes">Notes</Label>
              <Input
                id="cred-notes"
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={saveEntry}>
              {editing ? "Save changes" : "Add credential"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
