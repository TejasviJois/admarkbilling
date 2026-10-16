import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
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
import {
  Field,
  OperationsLoading,
  OperationsPageHeader,
} from "@/components/operations/operations-ui";
import { useDirectoryContacts } from "@/hooks/use-directory-contacts";
import { useOperations } from "@/hooks/use-operations";
import { getAuthStatusCached } from "@/lib/auth-status-cache";
import { logClientError } from "@/lib/client-logger";
import { mergeDirectoryContacts, parseContactWorkbook } from "@/lib/contact-import";
import { leadFromContact } from "@/lib/lead-conversion";
import {
  inferSalesSector,
  resolveContactSector,
  SALES_SECTORS,
  UNCATEGORIZED_SECTOR,
} from "@/lib/sales-sectors";
import type { Contact, Lead } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/directory")({ component: DirectoryRoute });

const PAGE_SIZE = 40;

const EMPTY_FORM = {
  personName: "",
  companyName: "",
  phone: "",
  email: "",
  designation: "",
  contactVia: "",
  sector: "",
};

function normalizeName(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function openLeadMatchesContact(lead: Lead, contact: Contact): boolean {
  if (lead.status === "won" || lead.status === "lost") return false;
  const person = normalizeName(contact.personName);
  const company = normalizeName(contact.companyName || contact.personName);
  const leadNames = [lead.company, lead.name, lead.contactPerson].map(normalizeName).filter(Boolean);
  return leadNames.some((name) => name === person || name === company);
}

function companyLabel(contact: Contact): string {
  return contact.companyName?.trim() || contact.personName;
}

/** True when the display name is missing / placeholder (keep these at the bottom). */
function hasMissingName(contact: Contact): boolean {
  const name = (contact.personName ?? "").trim().toLowerCase();
  if (!name) return true;
  return (
    name === "-" ||
    name === "—" ||
    name === "–" ||
    name === "." ||
    name === "n/a" ||
    name === "na" ||
    name === "unknown" ||
    name === "null" ||
    name === "undefined"
  );
}

function meaningfulCell(value: string | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "—";
  const lower = raw.toLowerCase();
  if (
    lower === "-" ||
    lower === "—" ||
    lower === "–" ||
    lower === "." ||
    lower === "n/a" ||
    lower === "na" ||
    lower === "null" ||
    lower === "undefined"
  ) {
    return "—";
  }
  return raw;
}

/** Split pasted multi-email blobs ("a@x.com / b@y.com") into clean addresses. */
function splitEmails(value: string | undefined): string[] {
  const raw = meaningfulCell(value);
  if (raw === "—") return [];
  const found = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  const unique: string[] = [];
  for (const email of found) {
    const normalized = email.toLowerCase();
    if (!unique.includes(normalized)) unique.push(normalized);
  }
  return unique;
}

function DirectoryRoute() {
  const [salesOnly, setSalesOnly] = useState<boolean | null>(null);

  useEffect(() => {
    void getAuthStatusCached()
      .then((status) => setSalesOnly(status.role === "sales"))
      .catch(() => setSalesOnly(false));
  }, []);

  if (salesOnly === null) return <OperationsLoading />;
  return salesOnly ? <SalesDirectoryPage /> : <AdminDirectoryPage />;
}

function useDirectoryBrowse(contacts: Contact[]) {
  const [query, setQuery] = useState("");
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [page, setPage] = useState(0);

  const sectorCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const contact of contacts) {
      const sector = resolveContactSector(contact);
      counts.set(sector, (counts.get(sector) ?? 0) + 1);
    }
    return counts;
  }, [contacts]);

  const sectorOptions = useMemo(() => {
    const known = new Map<string, number>(SALES_SECTORS.map((s, i) => [s, i]));
    known.set(UNCATEGORIZED_SECTOR, SALES_SECTORS.length + 50);
    return [...sectorCounts.entries()]
      .map(([sector, count]) => ({ sector, count }))
      .sort((a, b) => {
        const ai = known.get(a.sector) ?? SALES_SECTORS.length;
        const bi = known.get(b.sector) ?? SALES_SECTORS.length;
        if (ai !== bi) return ai - bi;
        return a.sector.localeCompare(b.sector);
      });
  }, [sectorCounts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts
      .filter((contact) => {
        const sector = resolveContactSector(contact);
        if (sectorFilter !== "all" && sector !== sectorFilter) return false;
        if (!q) return true;
        return [
          contact.personName,
          contact.companyName,
          contact.phone,
          contact.email,
          contact.designation,
          contact.contactVia,
          sector,
        ].some((value) => value?.toLowerCase().includes(q));
      })
      .sort((a, b) => {
        const missingCmp = Number(hasMissingName(a)) - Number(hasMissingName(b));
        if (missingCmp !== 0) return missingCmp;
        const byContacted = Number(a.contacted === true) - Number(b.contacted === true);
        if (byContacted !== 0) return byContacted;
        const nameCmp = a.personName.localeCompare(b.personName, undefined, {
          sensitivity: "base",
        });
        if (nameCmp !== 0) return nameCmp;
        return companyLabel(a).localeCompare(companyLabel(b), undefined, { sensitivity: "base" });
      });
  }, [contacts, query, sectorFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = useMemo(
    () => filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE),
    [filtered, safePage],
  );

  useEffect(() => {
    setPage(0);
  }, [query, sectorFilter]);

  return {
    query,
    setQuery,
    sectorFilter,
    setSectorFilter,
    sectorOptions,
    filtered,
    pageRows,
    page: safePage,
    setPage,
    pageCount,
  };
}

function SalesDirectoryPage() {
  const { contacts, loading, error, setContacted } = useDirectoryContacts();
  const openContacts = useMemo(
    () => contacts.filter((contact) => contact.contacted !== true),
    [contacts],
  );
  const browse = useDirectoryBrowse(openContacts);

  if (loading) return <OperationsLoading />;
  if (error) {
    return (
      <div className="glass-panel rounded-2xl border border-rose-500/20 bg-rose-500/5 p-8 text-center text-sm text-rose-400">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <OperationsPageHeader
        title="Directory"
        description="Reach out, then mark Yes to move the contact to Contacted — win from there."
      />
      <DirectoryWorkbench
        query={browse.query}
        setQuery={browse.setQuery}
        sectorFilter={browse.sectorFilter}
        setSectorFilter={browse.setSectorFilter}
        sectorOptions={browse.sectorOptions}
        filteredCount={browse.filtered.length}
        total={openContacts.length}
      >
        {openContacts.length === 0 ? (
          <div className="glass-panel rounded-2xl border border-dashed border-white/10 py-16 text-center text-sm text-white/40">
            {contacts.length === 0
              ? "No contacts yet. Ask an admin to upload the directory list."
              : "All directory contacts are on Contacted. Win from there when a deal closes."}
          </div>
        ) : (
          <DirectoryTable
            rows={browse.pageRows}
            emptyMessage="No matches. Try another sector or clear search."
            page={browse.page}
            pageCount={browse.pageCount}
            totalFiltered={browse.filtered.length}
            onPageChange={browse.setPage}
            markContactedOnly
            onContacted={(id, contacted) => {
              void setContacted(id, contacted)
                .then(() => {
                  if (contacted) toast.success("Moved to Contacted.");
                })
                .catch(() => toast.error("Could not update contacted status."));
            }}
          />
        )}
      </DirectoryWorkbench>
    </div>
  );
}

function AdminDirectoryPage() {
  const { ops, persist, loading } = useOperations();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const contacts = ops.contacts ?? [];
  const browse = useDirectoryBrowse(contacts);

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (contact: Contact) => {
    setEditing(contact);
    setFormOpen(true);
  };

  const handleSave = (saved: Contact) => {
    const inferred = inferSalesSector(saved.companyName, saved.personName);
    const withSector: Contact = {
      ...saved,
      sector:
        saved.sector?.trim() && saved.sector !== UNCATEGORIZED_SECTOR
          ? saved.sector.trim()
          : inferred !== UNCATEGORIZED_SECTOR
            ? inferred
            : undefined,
    };
    const next = editing
      ? contacts.map((contact) => (contact.id === withSector.id ? withSector : contact))
      : [withSector, ...contacts];
    persist({ ...ops, contacts: next });
  };

  const moveToLeads = (contact: Contact) => {
    const openDeals = (ops.leads ?? []).filter((lead) => openLeadMatchesContact(lead, contact));
    if (openDeals.length > 0) {
      if (
        !confirm(
          `${contact.personName} already has ${openDeals.length} open deal(s) in Leads. Add another deal anyway?`,
        )
      ) {
        return;
      }
    } else if (
      !confirm(
        `Add ${contact.personName} to Leads? They stay in the directory so you can open more deals later.`,
      )
    ) {
      return;
    }
    persist({
      ...ops,
      leads: [leadFromContact(contact), ...(ops.leads ?? [])],
    });
  };

  const handleRemove = (contact: Contact) => {
    if (!confirm(`Remove ${contact.personName} from the directory?`)) return;
    persist(
      { ...ops, contacts: contacts.filter((c) => c.id !== contact.id) },
      { deleteIds: { contacts: [contact.id] } },
    );
  };

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const parsed = await parseContactWorkbook(file);
      const { contacts: next, added, updated } = mergeDirectoryContacts(contacts, parsed.rows);
      await persist({ ...ops, contacts: next });
      toast.success(
        `Imported ${parsed.rowCount} contacts (${added} new · ${updated} updated) from ${parsed.sheetName}`,
      );
    } catch (error) {
      logClientError("directory.upload", error);
      toast.error(error instanceof Error ? error.message : "Could not import spreadsheet.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (loading) return <OperationsLoading />;

  return (
    <div className="space-y-5">
      <OperationsPageHeader
        title="Directory"
        description="Contact book for sales — filter by sector, then reach out."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => void handleUpload(e.target.files?.[0])}
            />
            <Button
              type="button"
              variant="outline"
              disabled={uploading}
              className="rounded-xl border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              {uploading ? "Uploading…" : "Upload list"}
            </Button>
            <Button
              type="button"
              className="rounded-xl bg-gradient-to-r from-[#ff6b2b] to-[#f04400] text-white font-semibold hover:brightness-110 shadow-lg shadow-[#ff6b2b]/25 active:scale-95 transition-all"
              onClick={openAdd}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add contact
            </Button>
          </div>
        }
      />

      <DirectoryWorkbench
        query={browse.query}
        setQuery={browse.setQuery}
        sectorFilter={browse.sectorFilter}
        setSectorFilter={browse.setSectorFilter}
        sectorOptions={browse.sectorOptions}
        filteredCount={browse.filtered.length}
        total={contacts.length}
      >
        {contacts.length === 0 ? (
          <div className="glass-panel rounded-2xl border border-dashed border-white/10 py-16 text-center text-sm text-white/40">
            Directory is empty. Upload a spreadsheet (Name, Company, Phone, Sector) or add a contact.
          </div>
        ) : (
          <DirectoryTable
            rows={browse.pageRows}
            emptyMessage="No matches. Try another sector or clear search."
            page={browse.page}
            pageCount={browse.pageCount}
            totalFiltered={browse.filtered.length}
            onPageChange={browse.setPage}
            onContacted={(id, contacted) => {
              const next = contacts.map((c) => (c.id === id ? { ...c, contacted } : c));
              void persist({ ...ops, contacts: next });
            }}
            onEdit={openEdit}
            onRemove={handleRemove}
            onMoveToLeads={moveToLeads}
          />
        )}
      </DirectoryWorkbench>

      <ContactFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        contact={editing}
        onSave={handleSave}
      />
    </div>
  );
}

function shortSectorLabel(sector: string): string {
  const SHORT: Record<string, string> = {
    "Tourism & Travel": "Tourism",
    "Hospitality & Stay": "Hospitality",
    "Real Estate & Construction": "Real estate",
    "Retail & Fashion": "Retail",
    "Food & Beverage": "Food",
    "Finance & Lending": "Finance",
    "Events & Media": "Events",
    "Technology & SaaS": "Tech",
    "Manufacturing & Trade": "Trade",
    "Professional Services": "Services",
  };
  return SHORT[sector] ?? sector;
}

function DirectoryWorkbench({
  query,
  setQuery,
  sectorFilter,
  setSectorFilter,
  sectorOptions,
  filteredCount,
  total,
  children,
}: {
  query: string;
  setQuery: (value: string) => void;
  sectorFilter: string;
  setSectorFilter: (value: string) => void;
  sectorOptions: Array<{ sector: string; count: number }>;
  filteredCount: number;
  total: number;
  children: React.ReactNode;
}) {
  const activeSectorLabel = sectorFilter === "all" ? null : sectorFilter;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, company, phone, email…"
            className="pl-10 rounded-xl border-white/10 bg-white/[0.04] text-white placeholder:text-white/40 focus:border-[#ff6b2b]/50 focus:ring-1 focus:ring-[#ff6b2b]"
          />
        </div>
        <p className="text-xs tabular-nums font-mono text-white/50 sm:text-right">
          {filteredCount} of {total} contacts
        </p>
      </div>

      {/* Mobile: sector dropdown */}
      <div className="sm:hidden">
        <label htmlFor="directory-sector-mobile" className="sr-only">
          Sector
        </label>
        <select
          id="directory-sector-mobile"
          value={sectorFilter}
          onChange={(e) => setSectorFilter(e.target.value)}
          className="flex h-10 w-full rounded-xl border border-white/10 bg-[#14141c] px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#ff6b2b]"
        >
          <option value="all" className="bg-[#14141c] text-white">All sectors ({total})</option>
          {sectorOptions.map((option) => (
            <option key={option.sector} value={option.sector} className="bg-[#14141c] text-white">
              {shortSectorLabel(option.sector)} ({option.count})
            </option>
          ))}
        </select>
      </div>

      {/* sm+: horizontal sector pill dock */}
      <div className="hidden sm:block">
        <div
          className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]"
          role="tablist"
          aria-label="Filter by sector"
        >
          <button
            type="button"
            role="tab"
            aria-selected={sectorFilter === "all"}
            onClick={() => setSectorFilter("all")}
            className={cn(
              "shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer",
              sectorFilter === "all"
                ? "bg-gradient-to-r from-[#ff6b2b]/15 to-[#ff6b2b]/5 text-[#ff6b2b] border border-[#ff6b2b]/30 shadow-[0_0_12px_rgba(255,107,43,0.15)]"
                : "border border-white/10 bg-white/[0.02] text-white/60 hover:text-white hover:bg-white/[0.06]",
            )}
          >
            All
            <span className="ml-1.5 font-mono text-[11px] opacity-70">({total})</span>
          </button>
          {sectorOptions.map((option) => (
            <button
              key={option.sector}
              type="button"
              role="tab"
              aria-selected={sectorFilter === option.sector}
              title={option.sector}
              onClick={() => setSectorFilter(option.sector)}
              className={cn(
                "shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer",
                sectorFilter === option.sector
                  ? "bg-gradient-to-r from-[#ff6b2b]/15 to-[#ff6b2b]/5 text-[#ff6b2b] border border-[#ff6b2b]/30 shadow-[0_0_12px_rgba(255,107,43,0.15)]"
                  : "border border-white/10 bg-white/[0.02] text-white/60 hover:text-white hover:bg-white/[0.06]",
              )}
            >
              {shortSectorLabel(option.sector)}
              <span className="ml-1.5 font-mono text-[11px] opacity-70">
                ({option.count})
              </span>
            </button>
          ))}
        </div>
      </div>

      {activeSectorLabel ? (
        <p className="text-xs text-white/50">
          Filtered by <span className="font-semibold text-white">{activeSectorLabel}</span>
          {" · "}
          {filteredCount} {filteredCount === 1 ? "contact" : "contacts"}
        </p>
      ) : null}

      {children}
    </div>
  );
}

function DirectoryTable({
  rows,
  emptyMessage,
  page,
  pageCount,
  totalFiltered,
  onPageChange,
  onContacted,
  onPushWin,
  onEdit,
  onRemove,
  onMoveToLeads,
  markContactedOnly = false,
}: {
  rows: Contact[];
  emptyMessage: string;
  page: number;
  pageCount: number;
  totalFiltered: number;
  onPageChange: (page: number) => void;
  onContacted?: (id: string, contacted: boolean) => void;
  onPushWin?: (contact: Contact) => void;
  onEdit?: (contact: Contact) => void;
  onRemove?: (contact: Contact) => void;
  onMoveToLeads?: (contact: Contact) => void;
  /** Sales open queue — single Yes moves to Contacted. */
  markContactedOnly?: boolean;
}) {
  const from = totalFiltered === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min(totalFiltered, page * PAGE_SIZE + rows.length);
  const showAdminActions = Boolean(onEdit || onRemove || onMoveToLeads);
  const showActions = showAdminActions || Boolean(onPushWin);

  if (rows.length === 0) {
    return (
      <div className="glass-panel rounded-2xl border border-white/10 px-4 py-16 text-center text-sm text-white/40">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {rows.map((contact) => {
          const company = companyLabel(contact);
          const role = meaningfulCell(contact.designation);
          const emails = splitEmails(contact.email);
          return (
            <div
              key={contact.id}
              className={cn(
                "glass-panel rounded-2xl border border-white/10 p-4 transition-all hover:border-white/20",
                contact.contacted && "opacity-60",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-white">{contact.personName}</p>
                  {role !== "—" ? (
                    <p className="truncate text-xs text-white/50">{role}</p>
                  ) : null}
                  <p className="mt-0.5 truncate text-xs text-white/70">{company}</p>
                </div>
                {onContacted ? (
                  markContactedOnly ? (
                    <button
                      type="button"
                      onClick={() => onContacted(contact.id, true)}
                      className="shrink-0 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/80 hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-400 transition-all cursor-pointer"
                    >
                      Contacted?
                    </button>
                  ) : (
                    <div className="inline-flex shrink-0 rounded-xl border border-white/10 bg-white/[0.02] p-0.5">
                      <button
                        type="button"
                        onClick={() => onContacted(contact.id, true)}
                        className={cn(
                          "rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer",
                          contact.contacted
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                            : "text-white/50 hover:text-white",
                        )}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => onContacted(contact.id, false)}
                        className={cn(
                          "rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer",
                          !contact.contacted ? "bg-white/[0.06] text-white" : "text-white/50 hover:text-white",
                        )}
                      >
                        No
                      </button>
                    </div>
                  )
                ) : null}
              </div>
              <div className="mt-2.5 space-y-0.5 text-xs text-white/60 font-mono">
                {contact.phone ? <p className="tabular-nums text-white/90">{contact.phone}</p> : null}
                {emails.map((address) => (
                  <a
                    key={address}
                    href={`mailto:${address}`}
                    className="block truncate font-medium text-white/70 hover:text-white underline-offset-2 hover:underline"
                  >
                    {address}
                  </a>
                ))}
                {!contact.phone && emails.length === 0 ? <p className="text-white/30">—</p> : null}
              </div>
              {showActions ? (
                <div className="mt-3.5 flex flex-wrap items-center gap-2 pt-2 border-t border-white/10">
                  {onPushWin ? (
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 gap-1 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-3 text-xs font-semibold text-white shadow-md shadow-emerald-500/20 hover:brightness-110"
                      onClick={() => onPushWin(contact)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Win
                    </Button>
                  ) : null}
                  {onMoveToLeads ? (
                    <button
                      type="button"
                      onClick={() => onMoveToLeads(contact)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-xs font-semibold text-white/70 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer"
                    >
                      Lead
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  ) : null}
                  {onEdit ? (
                    <button
                      type="button"
                      onClick={() => onEdit(contact)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-white/60 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer"
                      aria-label="Edit"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  {onRemove ? (
                    <button
                      type="button"
                      onClick={() => onRemove(contact)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-rose-500/20 bg-rose-500/5 text-rose-400 hover:bg-rose-500/15 transition-all cursor-pointer"
                      aria-label="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-2xl border border-white/10 glass-panel md:block shadow-xl">
        <div className="max-h-[min(70vh,52rem)] overflow-auto [scrollbar-width:thin]">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-white/10 bg-[#0f0f14]/95 text-xs font-semibold uppercase tracking-wider text-white/40 backdrop-blur-md">
                <th className="px-4 py-3.5">Contact</th>
                <th className="px-4 py-3.5">Company</th>
                <th className="w-[14rem] px-4 py-3.5">Reach</th>
                <th className="w-[8.5rem] px-4 py-3.5">Contacted</th>
                {showActions ? <th className="px-4 py-3.5 text-right">Action</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {rows.map((contact) => {
                const company = companyLabel(contact);
                const role = meaningfulCell(contact.designation);
                const emails = splitEmails(contact.email);
                return (
                  <tr
                    key={contact.id}
                    className={cn("hover:bg-white/[0.02] transition-colors", contact.contacted && "opacity-60")}
                  >
                    <td className="max-w-[14rem] px-4 py-3 align-top">
                      <p className="truncate font-semibold text-white" title={contact.personName}>
                        {contact.personName}
                      </p>
                      {role !== "—" ? (
                        <p className="mt-0.5 truncate text-xs text-white/50" title={role}>
                          {role}
                        </p>
                      ) : null}
                    </td>
                    <td
                      className="max-w-[14rem] truncate px-4 py-3 align-top text-white/70"
                      title={company}
                    >
                      {company}
                    </td>
                    <td className="w-[14rem] max-w-[14rem] px-4 py-3 align-top font-mono text-xs">
                      <p
                        className="truncate tabular-nums text-white/90"
                        title={contact.phone || undefined}
                      >
                        {contact.phone || "—"}
                      </p>
                      {emails.length === 0 ? (
                        <p className="mt-0.5 truncate text-xs text-white/30">—</p>
                      ) : (
                        <div className="mt-0.5 space-y-0.5">
                          {emails.map((address) => (
                            <a
                              key={address}
                              href={`mailto:${address}`}
                              className="block truncate text-xs font-medium text-white/70 underline-offset-2 hover:underline hover:text-white"
                              title={address}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {address}
                            </a>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      {onContacted ? (
                        markContactedOnly ? (
                          <button
                            type="button"
                            onClick={() => onContacted(contact.id, true)}
                            className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-semibold text-white/70 hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-400 transition-all cursor-pointer"
                          >
                            Mark Yes
                          </button>
                        ) : (
                          <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.02] p-0.5">
                            <button
                              type="button"
                              onClick={() => onContacted(contact.id, true)}
                              className={cn(
                                "rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer",
                                contact.contacted
                                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                                  : "text-white/50 hover:text-white",
                              )}
                            >
                              Yes
                            </button>
                            <button
                              type="button"
                              onClick={() => onContacted(contact.id, false)}
                              className={cn(
                                "rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer",
                                !contact.contacted
                                  ? "bg-white/[0.06] text-white"
                                  : "text-white/50 hover:text-white",
                              )}
                            >
                              No
                            </button>
                          </div>
                        )
                      ) : (
                        <span className="text-xs font-medium text-white/50">
                          {contact.contacted ? "Yes" : "No"}
                        </span>
                      )}
                    </td>
                    {showActions ? (
                      <td className="px-4 py-3 text-right align-top">
                        <div className="flex flex-nowrap items-center justify-end gap-1.5">
                          {onPushWin ? (
                            <Button
                              type="button"
                              size="sm"
                              className="h-8 shrink-0 gap-1 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-3 text-xs font-semibold text-white shadow-md shadow-emerald-500/20 hover:brightness-110"
                              onClick={() => onPushWin(contact)}
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Win
                            </Button>
                          ) : null}
                          {onMoveToLeads ? (
                            <button
                              type="button"
                              onClick={() => onMoveToLeads(contact)}
                              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 text-xs font-semibold text-white/70 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer"
                              title="Add to Pipeline Leads"
                            >
                              Lead
                              <ArrowRight className="h-3 w-3" />
                            </button>
                          ) : null}
                          {showAdminActions && onEdit ? (
                            <button
                              type="button"
                              onClick={() => onEdit(contact)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-white/60 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer"
                              title="Edit"
                              aria-label="Edit contact"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                          {showAdminActions && onRemove ? (
                            <button
                              type="button"
                              onClick={() => onRemove(contact)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-rose-500/20 bg-rose-500/5 text-rose-400 hover:bg-rose-500/15 transition-all cursor-pointer"
                              title="Remove"
                              aria-label="Remove from directory"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 glass-panel rounded-2xl border border-white/10 px-4 py-3">
        <p className="text-xs font-mono text-white/50">
          Showing {from}–{to} of {totalFiltered} contacts
        </p>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 px-2.5 rounded-xl border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.08]"
            disabled={page <= 0}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[4.5rem] text-center text-xs font-mono text-white/60">
            {page + 1} / {pageCount}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 px-2.5 rounded-xl border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.08]"
            disabled={page >= pageCount - 1}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ContactFormDialog({
  open,
  onOpenChange,
  contact,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: Contact | null;
  onSave: (contact: Contact) => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (!open) return;
    setForm(
      contact
        ? {
            personName: contact.personName,
            companyName: contact.companyName ?? "",
            phone: contact.phone ?? "",
            email: contact.email ?? "",
            designation: contact.designation ?? "",
            contactVia: contact.contactVia ?? "",
            sector: contact.sector ?? resolveContactSector(contact),
          }
        : EMPTY_FORM,
    );
  }, [open, contact]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const personName = form.personName.trim();
    if (!personName) {
      alert("Please enter the person's name.");
      return;
    }
    if (!form.phone.trim() && !form.email.trim() && !form.contactVia.trim()) {
      alert("Add a phone, email, or note who to contact them through.");
      return;
    }
    onSave({
      id: contact?.id ?? `contact-${crypto.randomUUID().slice(0, 8)}`,
      personName,
      companyName: form.companyName.trim() || undefined,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      designation: form.designation.trim() || undefined,
      contactVia: form.contactVia.trim() || undefined,
      sector: form.sector.trim() || undefined,
      contacted: contact?.contacted,
      createdAt: contact?.createdAt ?? new Date().toISOString().slice(0, 10),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-3xl border border-white/10 bg-[#0e0e14]/95 backdrop-blur-2xl text-white shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white">{contact ? "Edit contact" : "Add contact"}</DialogTitle>
          <DialogDescription className="text-white/60">
            Same company stays together in the list; sector filters related businesses.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <Field label="Person's name *" id="contact-person-name">
            <Input
              id="contact-person-name"
              value={form.personName}
              onChange={(e) => setForm((f) => ({ ...f, personName: e.target.value }))}
              placeholder="e.g. Madhu"
              className="rounded-xl border-white/10 bg-white/[0.04] text-white placeholder:text-white/40 focus:border-[#ff6b2b]/50 focus:ring-1 focus:ring-[#ff6b2b]"
              autoFocus
            />
          </Field>
          <Field label="Company name" id="contact-company-name">
            <Input
              id="contact-company-name"
              value={form.companyName}
              onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
              placeholder="e.g. Balaji Travels"
              className="rounded-xl border-white/10 bg-white/[0.04] text-white placeholder:text-white/40 focus:border-[#ff6b2b]/50 focus:ring-1 focus:ring-[#ff6b2b]"
            />
          </Field>
          <Field label="Role / designation" id="contact-designation">
            <Input
              id="contact-designation"
              value={form.designation}
              onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))}
              placeholder="e.g. CEO, Sales Manager"
              className="rounded-xl border-white/10 bg-white/[0.04] text-white placeholder:text-white/40 focus:border-[#ff6b2b]/50 focus:ring-1 focus:ring-[#ff6b2b]"
            />
          </Field>
          <Field label="Email" id="contact-email">
            <Input
              id="contact-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="name@company.com"
              className="rounded-xl border-white/10 bg-white/[0.04] text-white placeholder:text-white/40 focus:border-[#ff6b2b]/50 focus:ring-1 focus:ring-[#ff6b2b]"
            />
          </Field>
          <Field label="Sector" id="contact-sector">
            <select
              id="contact-sector"
              value={form.sector}
              onChange={(e) => setForm((f) => ({ ...f, sector: e.target.value }))}
              className="flex h-10 w-full rounded-xl border border-white/10 bg-[#14141c] px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#ff6b2b]"
            >
              <option value="" className="bg-[#14141c] text-white">Auto-detect from company</option>
              {SALES_SECTORS.map((sector) => (
                <option key={sector} value={sector} className="bg-[#14141c] text-white">
                  {sector}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Phone number" id="contact-phone">
            <Input
              id="contact-phone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="Direct number, if you have it"
              className="rounded-xl border-white/10 bg-white/[0.04] text-white placeholder:text-white/40 focus:border-[#ff6b2b]/50 focus:ring-1 focus:ring-[#ff6b2b]"
            />
          </Field>
          <Field label="No phone? Who to contact through" id="contact-via">
            <Input
              id="contact-via"
              value={form.contactVia}
              onChange={(e) => setForm((f) => ({ ...f, contactVia: e.target.value }))}
              placeholder="e.g. Prajwal, or their office reception"
              className="rounded-xl border-white/10 bg-white/[0.04] text-white placeholder:text-white/40 focus:border-[#ff6b2b]/50 focus:ring-1 focus:ring-[#ff6b2b]"
            />
          </Field>
          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-white/10">
            <Button type="button" variant="outline" className="rounded-xl border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="rounded-xl bg-gradient-to-r from-[#ff6b2b] to-[#f04400] text-white font-semibold hover:brightness-110 shadow-lg shadow-[#ff6b2b]/20">
              {contact ? "Save changes" : "Add to directory"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
