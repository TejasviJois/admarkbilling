import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, Copy, Eye, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  OperationsLoading,
  OperationsPageHeader,
} from "@/components/operations/operations-ui";
import { RecordSalesWinDialog } from "@/components/sales/RecordSalesWinDialog";
import { useDirectoryContacts } from "@/hooks/use-directory-contacts";
import { useLeadList } from "@/hooks/use-lead-list";
import { getAuthStatusCached } from "@/lib/auth-status-cache";
import { classifyLeadListTrack } from "@/lib/lead-list-import";
import type { Contact, LeadListEntry } from "@/lib/types";

export const Route = createFileRoute("/contacted")({ component: ContactedRoute });

type ContactedRow =
  | { kind: "lead"; id: string; title: string; subtitle?: string; phone?: string; email?: string; lead: LeadListEntry }
  | {
      kind: "directory";
      id: string;
      title: string;
      subtitle?: string;
      phone?: string;
      email?: string;
      contact: Contact;
    };

function ContactedRoute() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    void getAuthStatusCached()
      .then((status) => setAllowed(status.role === "sales" || status.role === "admin"))
      .catch(() => setAllowed(false));
  }, []);
  if (allowed === null) return <OperationsLoading />;
  if (!allowed) {
    return (
      <div className="rounded-lg border border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
        Contacted is for sales follow-ups.
      </div>
    );
  }
  return <ContactedPage />;
}

function ContactedPage() {
  const navigate = useNavigate();
  const {
    entries: leadList,
    loading: leadsLoading,
    error: leadsError,
    setContacted: patchLeadContacted,
    reload: reloadLeads,
  } = useLeadList();
  const {
    contacts,
    loading: contactsLoading,
    error: contactsError,
    setContacted: patchContactContacted,
    reload: reloadContacts,
  } = useDirectoryContacts();

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ContactedRow | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [winLead, setWinLead] = useState<LeadListEntry | null | undefined>(undefined);
  const [winContact, setWinContact] = useState<Contact | null | undefined>(undefined);

  const rows = useMemo((): ContactedRow[] => {
    const fromLeads: ContactedRow[] = leadList
      .filter((entry) => entry.contacted === true && entry.salesWon !== true)
      .map((lead) => ({
        kind: "lead" as const,
        id: lead.id,
        title: lead.title,
        subtitle: lead.oneLiner?.replace(/^\s*[*•\-–]+\s*/, "").trim(),
        phone: lead.phone,
        email: lead.email,
        lead,
      }));
    const fromDirectory: ContactedRow[] = contacts
      .filter((contact) => contact.contacted === true && contact.salesWon !== true)
      .map((contact) => ({
        kind: "directory" as const,
        id: contact.id,
        title: contact.personName,
        subtitle: contact.companyName?.trim() || contact.designation,
        phone: contact.phone,
        email: contact.email,
        contact,
      }));
    return [...fromLeads, ...fromDirectory].sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
    );
  }, [leadList, contacts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const hay = [row.title, row.subtitle, row.phone, row.email, row.kind]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query]);

  const moveBack = (row: ContactedRow) => {
    if (row.kind === "lead") {
      void patchLeadContacted(row.id, false)
        .then(() => toast.success("Moved back to Lead List."))
        .catch(() => toast.error("Could not update status."));
    } else {
      void patchContactContacted(row.id, false)
        .then(() => toast.success("Moved back to Directory."))
        .catch(() => toast.error("Could not update status."));
    }
    if (selected?.id === row.id) setSelected(null);
  };

  const handleCopy = async (row: ContactedRow) => {
    const text =
      row.kind === "lead"
        ? [
            `Title: ${row.lead.title}`,
            row.lead.oneLiner ? `One-liner: ${row.lead.oneLiner}` : null,
            row.lead.phone ? `Phone: ${row.lead.phone}` : null,
            row.lead.email ? `Email: ${row.lead.email}` : null,
            row.lead.howToWin ? `How to win: ${row.lead.howToWin}` : null,
          ]
            .filter(Boolean)
            .join("\n")
        : [
            `Name: ${row.contact.personName}`,
            row.contact.companyName ? `Company: ${row.contact.companyName}` : null,
            row.contact.phone ? `Phone: ${row.contact.phone}` : null,
            row.contact.email ? `Email: ${row.contact.email}` : null,
          ]
            .filter(Boolean)
            .join("\n");
    const ok = await copyText(text);
    if (!ok) {
      toast.error("Could not copy to clipboard.");
      return;
    }
    setCopiedId(row.id);
    toast.success("Copied — paste into ChatGPT");
    window.setTimeout(() => setCopiedId((current) => (current === row.id ? null : current)), 2000);
  };

  const openWin = (row: ContactedRow) => {
    if (row.kind === "lead") {
      setWinContact(undefined);
      setWinLead(row.lead);
    } else {
      setWinLead(undefined);
      setWinContact(row.contact);
    }
  };

  const loading = leadsLoading || contactsLoading;
  const error = leadsError || contactsError;

  if (loading) return <OperationsLoading />;
  if (error) {
    return (
      <div className="rounded-lg border border-border bg-muted/20 p-8 text-center text-sm text-destructive">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OperationsPageHeader
        title="Contacted"
        description="Reached from Lead List or Directory. Record a win with the closed price — or leave them here."
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search contacted…"
            className="pl-9"
          />
        </div>
        <p className="text-xs tabular-nums text-muted-foreground">
          {filtered.length} of {rows.length}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          Nothing contacted yet. Mark Yes on Lead List or Directory to move items here.
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {filtered.length === 0 ? (
              <div className="rounded-lg border border-border px-4 py-10 text-center text-sm text-muted-foreground">
                No matches.
              </div>
            ) : (
              filtered.map((row, index) => (
                <div
                  key={`${row.kind}-${row.id}`}
                  className="rounded-lg border border-border bg-card p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-muted-foreground">
                        #{index + 1} · {row.kind === "lead" ? "Lead List" : "Directory"}
                      </p>
                      <p className="font-medium leading-snug text-foreground">{row.title}</p>
                      {row.subtitle ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {row.subtitle}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                    {row.phone ? <p>{row.phone}</p> : null}
                    {row.email ? <p className="truncate">{row.email}</p> : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 gap-1 px-2.5 text-xs"
                      onClick={() => openWin(row)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Win
                    </Button>
                    <button
                      type="button"
                      onClick={() => moveBack(row)}
                      className="inline-flex h-8 items-center rounded-md border border-border px-2 text-[11px] font-medium text-muted-foreground"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCopy(row)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground"
                    >
                      {copiedId === row.id ? (
                        <Check className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelected(row)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-lg border border-border bg-card shadow-sm md:block">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
                    <th className="w-0 whitespace-nowrap px-3 py-2.5">#</th>
                    <th className="w-0 whitespace-nowrap px-3 py-2.5">Source</th>
                    <th className="min-w-[16rem] px-3 py-2.5">Title</th>
                    <th className="w-[11rem] px-3 py-2.5">Contact</th>
                    <th className="w-0 whitespace-nowrap px-3 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">
                        No matches.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((row, index) => (
                      <tr key={`${row.kind}-${row.id}`} className="hover:bg-muted/30">
                        <td className="whitespace-nowrap px-3 py-2.5 align-middle tabular-nums font-medium">
                          {index + 1}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 align-middle text-xs text-muted-foreground">
                          {row.kind === "lead" ? "Lead List" : "Directory"}
                        </td>
                        <td className="px-3 py-2.5 align-middle">
                          <p className="font-medium leading-snug text-foreground">{row.title}</p>
                          {row.subtitle ? (
                            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                              {row.subtitle}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 align-middle text-xs text-muted-foreground">
                          <div className="space-y-0.5">
                            {row.phone ? <p>{row.phone}</p> : null}
                            {row.email ? <p className="truncate">{row.email}</p> : null}
                            {!row.phone && !row.email ? <p>—</p> : null}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 align-middle">
                          <div className="ml-auto flex w-max items-center justify-end gap-0.5">
                            <Button
                              type="button"
                              size="sm"
                              className="h-8 shrink-0 gap-1 px-2.5 text-xs"
                              onClick={() => openWin(row)}
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Win
                            </Button>
                            <button
                              type="button"
                              onClick={() => moveBack(row)}
                              className="inline-flex h-8 items-center rounded-md border border-border px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                              title="Move back to source"
                            >
                              Back
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleCopy(row)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                              title="Copy"
                            >
                              {copiedId === row.id ? (
                                <Check className="h-4 w-4 text-emerald-400" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelected(row)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                              title="View"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <Dialog open={selected != null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-lg">
          {selected ? (
            <>
              <DialogHeader>
                <DialogTitle>{selected.title}</DialogTitle>
                <DialogDescription>
                  {selected.kind === "lead"
                    ? `Lead List · ${classifyLeadListTrack(selected.lead) === "tech" ? "Tech" : "Non-tech"}`
                    : "Directory"}
                </DialogDescription>
              </DialogHeader>
              <div className="mb-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    openWin(selected);
                    setSelected(null);
                  }}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Win
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => moveBack(selected)}>
                  Back to {selected.kind === "lead" ? "Lead List" : "Directory"}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {[selected.phone, selected.email].filter(Boolean).join(" · ") || "No contact details"}
              </p>
              {selected.subtitle ? (
                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{selected.subtitle}</p>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <RecordSalesWinDialog
        open={winLead !== undefined || winContact !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setWinLead(undefined);
            setWinContact(undefined);
          }
        }}
        lead={winLead ?? null}
        contact={winContact ?? null}
        onSaved={() => {
          void reloadLeads();
          void reloadContacts();
          void navigate({ to: "/my-wins" });
        }}
      />
    </div>
  );
}

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
