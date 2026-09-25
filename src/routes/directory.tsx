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
      <div className="rounded-lg border border-border bg-muted/20 p-8 text-center text-sm text-destructive">
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
          <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
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
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              {uploading ? "Uploading…" : "Upload list"}
            </Button>
            <Button type="button" onClick={openAdd}>
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
          <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
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
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, company, phone, email…"
            className="pl-9"
          />
        </div>
        <p className="text-xs tabular-nums text-muted-foreground sm:text-right">
          {filteredCount} of {total}
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
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
            "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <option value="all">All sectors ({total})</option>
          {sectorOptions.map((option) => (
            <option key={option.sector} value={option.sector}>
              {shortSectorLabel(option.sector)} ({option.count})
            </option>
          ))}
        </select>
      </div>

      {/* sm+: horizontal sector tabs */}
      <div className="hidden border-b border-border sm:block">
        <div
          className="flex gap-0.5 overflow-x-auto pb-px [scrollbar-width:thin]"
          role="tablist"
          aria-label="Filter by sector"
        >
          <button
            type="button"
            role="tab"
            aria-selected={sectorFilter === "all"}
            onClick={() => setSectorFilter("all")}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm transition-colors",
              sectorFilter === "all"
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            All
            <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">{total}</span>
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
                "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm transition-colors",
                sectorFilter === option.sector
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {shortSectorLabel(option.sector)}
              <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">
                {option.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {activeSectorLabel ? (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{activeSectorLabel}</span>
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
      <div className="rounded-lg border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {rows.map((contact) => {
          const company = companyLabel(contact);
          const role = meaningfulCell(contact.designation);
          const emails = splitEmails(contact.email);
          return (
            <div
              key={contact.id}
              className={cn(
                "rounded-lg border border-border bg-card p-3 shadow-sm",
                contact.contacted && "opacity-70",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{contact.personName}</p>
                  {role !== "—" ? (
                    <p className="truncate text-xs text-muted-foreground">{role}</p>
                  ) : null}
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">{company}</p>
                </div>
                {onContacted ? (
                  markContactedOnly ? (
                    <button
                      type="button"
                      onClick={() => onContacted(contact.id, true)}
                      className="shrink-0 rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-medium hover:bg-emerald-500/15 hover:text-emerald-600"
                    >
                      Yes
                    </button>
                  ) : (
                    <div className="inline-flex shrink-0 rounded-md border border-border p-0.5">
                      <button
                        type="button"
                        onClick={() => onContacted(contact.id, true)}
                        className={cn(
                          "rounded px-2 py-1 text-[11px] font-medium",
                          contact.contacted
                            ? "bg-emerald-500/15 text-emerald-600"
                            : "text-muted-foreground",
                        )}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => onContacted(contact.id, false)}
                        className={cn(
                          "rounded px-2 py-1 text-[11px] font-medium",
                          !contact.contacted ? "bg-muted text-foreground" : "text-muted-foreground",
                        )}
                      >
                        No
                      </button>
                    </div>
                  )
                ) : null}
              </div>
              <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                {contact.phone ? <p className="tabular-nums text-foreground">{contact.phone}</p> : null}
                {emails.map((address) => (
                  <a
                    key={address}
                    href={`mailto:${address}`}
                    className="block truncate font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    {address}
                  </a>
                ))}
                {!contact.phone && emails.length === 0 ? <p>—</p> : null}
              </div>
              {showActions ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {onPushWin ? (
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 gap-1 px-2.5 text-xs"
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
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-input px-2 text-[11px] font-medium"
                    >
                      Lead
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  ) : null}
                  {onEdit ? (
                    <button
                      type="button"
                      onClick={() => onEdit(contact)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input text-muted-foreground"
                      aria-label="Edit"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  {onRemove ? (
                    <button
                      type="button"
                      onClick={() => onRemove(contact)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input text-destructive"
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
      <div className="hidden overflow-hidden rounded-lg border border-border bg-card shadow-sm md:block">
        <div className="max-h-[min(70vh,52rem)] overflow-auto [scrollbar-width:thin]">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-muted/90 text-xs font-medium uppercase tracking-wider text-muted-foreground backdrop-blur-sm">
                <th className="px-3 py-2.5">Contact</th>
                <th className="px-3 py-2.5">Company</th>
                <th className="w-[13rem] px-3 py-2.5">Reach</th>
                <th className="w-[7.5rem] px-3 py-2.5">Contacted</th>
                {showActions ? <th className="px-3 py-2.5 text-right">Action</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((contact) => {
                const company = companyLabel(contact);
                const role = meaningfulCell(contact.designation);
                const emails = splitEmails(contact.email);
                return (
                  <tr
                    key={contact.id}
                    className={cn("hover:bg-muted/25", contact.contacted && "opacity-70")}
                  >
                    <td className="max-w-[14rem] px-3 py-2.5 align-top">
                      <p className="truncate font-medium text-foreground" title={contact.personName}>
                        {contact.personName}
                      </p>
                      {role !== "—" ? (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground" title={role}>
                          {role}
                        </p>
                      ) : null}
                    </td>
                    <td
                      className="max-w-[14rem] truncate px-3 py-2.5 align-top text-muted-foreground"
                      title={company}
                    >
                      {company}
                    </td>
                    <td className="w-[13rem] max-w-[13rem] px-3 py-2.5 align-top">
                      <p
                        className="truncate tabular-nums text-foreground"
                        title={contact.phone || undefined}
                      >
                        {contact.phone || "—"}
                      </p>
                      {emails.length === 0 ? (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">—</p>
                      ) : (
                        <div className="mt-0.5 space-y-0.5">
                          {emails.map((address) => (
                            <a
                              key={address}
                              href={`mailto:${address}`}
                              className="block truncate text-xs font-medium text-foreground underline-offset-2 hover:underline"
                              title={address}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {address}
                            </a>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      {onContacted ? (
                        markContactedOnly ? (
                          <button
                            type="button"
                            onClick={() => onContacted(contact.id, true)}
                            className="rounded-md border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-emerald-500/15 hover:text-emerald-600 dark:hover:text-emerald-400"
                          >
                            Yes
                          </button>
                        ) : (
                          <div className="inline-flex rounded-md border border-border p-0.5">
                            <button
                              type="button"
                              onClick={() => onContacted(contact.id, true)}
                              className={cn(
                                "rounded px-2 py-1 text-[11px] font-medium transition-colors",
                                contact.contacted
                                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                  : "text-muted-foreground hover:text-foreground",
                              )}
                            >
                              Yes
                            </button>
                            <button
                              type="button"
                              onClick={() => onContacted(contact.id, false)}
                              className={cn(
                                "rounded px-2 py-1 text-[11px] font-medium transition-colors",
                                !contact.contacted
                                  ? "bg-muted text-foreground"
                                  : "text-muted-foreground hover:text-foreground",
                              )}
                            >
                              No
                            </button>
                          </div>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {contact.contacted ? "Yes" : "No"}
                        </span>
                      )}
                    </td>
                    {showActions ? (
                      <td className="px-3 py-2.5 text-right align-top">
                        <div className="flex flex-nowrap items-center justify-end gap-1">
                          {onPushWin ? (
                            <Button
                              type="button"
                              size="sm"
                              className="h-8 shrink-0 gap-1 px-2.5 text-xs"
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
                              className="inline-flex h-8 items-center gap-1 rounded-md border border-input bg-card px-2 text-[11px] font-medium text-foreground hover:bg-secondary"
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
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-card text-muted-foreground hover:bg-secondary"
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
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-card text-destructive hover:bg-destructive/10"
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

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2.5 md:rounded-none md:border-0 md:border-t md:bg-transparent md:px-0">
        <p className="text-xs text-muted-foreground">
          {from}–{to} of {totalFiltered}
        </p>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 px-2"
            disabled={page <= 0}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[4.5rem] text-center text-xs text-muted-foreground">
            {page + 1} / {pageCount}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 px-2"
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{contact ? "Edit contact" : "Add contact"}</DialogTitle>
          <DialogDescription>
            Same company stays together in the list; sector filters related businesses.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Person's name *" id="contact-person-name">
            <Input
              id="contact-person-name"
              value={form.personName}
              onChange={(e) => setForm((f) => ({ ...f, personName: e.target.value }))}
              placeholder="e.g. Madhu"
              autoFocus
            />
          </Field>
          <Field label="Company name" id="contact-company-name">
            <Input
              id="contact-company-name"
              value={form.companyName}
              onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
              placeholder="e.g. Balaji Travels"
            />
          </Field>
          <Field label="Role / designation" id="contact-designation">
            <Input
              id="contact-designation"
              value={form.designation}
              onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))}
              placeholder="e.g. CEO, Sales Manager"
            />
          </Field>
          <Field label="Email" id="contact-email">
            <Input
              id="contact-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="name@company.com"
            />
          </Field>
          <Field label="Sector" id="contact-sector">
            <select
              id="contact-sector"
              value={form.sector}
              onChange={(e) => setForm((f) => ({ ...f, sector: e.target.value }))}
              className={cn(
                "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <option value="">Auto-detect from company</option>
              {SALES_SECTORS.map((sector) => (
                <option key={sector} value={sector}>
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
            />
          </Field>
          <Field label="No phone? Who to contact through" id="contact-via">
            <Input
              id="contact-via"
              value={form.contactVia}
              onChange={(e) => setForm((f) => ({ ...f, contactVia: e.target.value }))}
              placeholder="e.g. Prajwal, or their office reception"
            />
          </Field>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{contact ? "Save changes" : "Add to directory"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
