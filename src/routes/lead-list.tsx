import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Copy, Eye, Plus, Search, Trash2, Upload } from "lucide-react";
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
import { useLeadList } from "@/hooks/use-lead-list";
import { useOperations } from "@/hooks/use-operations";
import { getAuthStatusCached } from "@/lib/auth-status-cache";
import { logClientError } from "@/lib/client-logger";
import { mergeLeadListEntries, parseLeadListFile, classifyLeadListTrack } from "@/lib/lead-list-import";
import type { LeadListEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/lead-list")({ component: LeadListRoute });

function LeadListRoute() {
  const [role, setRole] = useState<"admin" | "sales" | null>(null);
  useEffect(() => {
    void getAuthStatusCached().then((status) => {
      setRole(status.role === "sales" ? "sales" : "admin");
    });
  }, []);
  if (role == null) return <OperationsLoading />;
  if (role === "sales") return <SalesLeadListPage />;
  return <AdminLeadListPage />;
}
type TrackFilter = "all" | "tech" | "non_tech";

function sortLeadEntries(entries: LeadListEntry[]): LeadListEntry[] {
  return [...entries].sort((a, b) => {
    const byContacted = Number(a.contacted === true) - Number(b.contacted === true);
    if (byContacted !== 0) return byContacted;
    const score = (b.leadScore ?? 0) - (a.leadScore ?? 0);
    if (score !== 0) return score;
    return a.externalId.localeCompare(b.externalId, undefined, { numeric: true });
  });
}

const DETAIL_SECTIONS: { title: string; keys: (keyof LeadListEntry)[] }[] = [
  {
    title: "Overview",
    keys: [
      "externalId",
      "dateTime",
      "phone",
      "email",
      "title",
      "oneLiner",
      "leadScore",
      "intent",
      "urgency",
      "category",
      "location",
      "projectType",
      "complexity",
      "engagementType",
    ],
  },
  {
    title: "Opportunity",
    keys: [
      "xFactor",
      "whatTheyWant",
      "platformModules",
      "technicalStack",
      "keyNotes",
      "engagementCommercial",
      "focus",
      "techFocus",
      "growthPath",
      "websiteStatus",
      "informationLevel",
    ],
  },
  {
    title: "How to win",
    keys: [
      "howToWin",
      "angle",
      "applicationRequirements",
      "applicationIncludes",
      "mostValuableProof",
      "frameExpertiseAround",
      "keyDifferentiator",
      "decisionDriver",
      "competition",
      "closeWindow",
      "redFlags",
    ],
  },
  {
    title: "Assessment",
    keys: [
      "whyScore",
      "strategicInsight",
      "excellentFit",
      "poorFit",
      "finalAssessment",
      "fullOriginal",
    ],
  },
];

const FIELD_LABELS: Partial<Record<keyof LeadListEntry, string>> = {
  externalId: "Lead ID",
  dateTime: "Date / Time",
  phone: "Phone",
  email: "Email",
  title: "Title",
  oneLiner: "One-liner",
  leadScore: "Lead score",
  intent: "Intent",
  urgency: "Urgency",
  category: "Category",
  location: "Location",
  projectType: "Project type",
  complexity: "Complexity",
  engagementType: "Engagement type",
  xFactor: "Real X-factor",
  whatTheyWant: "What they want",
  platformModules: "Platform modules",
  technicalStack: "Technical stack",
  keyNotes: "Key notes",
  engagementCommercial: "Engagement / commercial",
  focus: "Focus",
  techFocus: "Tech focus",
  growthPath: "Growth path",
  websiteStatus: "Website / product status",
  informationLevel: "Information level",
  howToWin: "How to win",
  angle: "Angle",
  applicationRequirements: "Application / DM requirements",
  applicationIncludes: "Application includes",
  mostValuableProof: "Most valuable proof",
  frameExpertiseAround: "Frame expertise around",
  keyDifferentiator: "Key differentiator",
  decisionDriver: "Decision driver",
  competition: "Competition",
  closeWindow: "Close window",
  redFlags: "Red flags",
  whyScore: "Why this scores this way",
  strategicInsight: "Strategic insight",
  excellentFit: "Excellent fit",
  poorFit: "Poor fit",
  finalAssessment: "Final assessment",
  fullOriginal: "Full original lead",
  contacted: "Contacted",
};

function formatFieldValue(entry: LeadListEntry, key: keyof LeadListEntry): string | null {
  const value = entry[key];
  if (value == null || value === "") return null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  return String(value);
}

/** Full lead dump top-to-bottom — ready to paste into ChatGPT. */
function formatLeadForCopy(entry: LeadListEntry): string {
  const lines: string[] = [
    `Lead: ${entry.title}`,
    `Lead ID: ${entry.externalId}`,
    `Contacted: ${entry.contacted ? "Yes" : "No"}`,
    "",
  ];
  for (const section of DETAIL_SECTIONS) {
    const body: string[] = [];
    for (const key of section.keys) {
      const value = formatFieldValue(entry, key);
      if (!value) continue;
      body.push(`${FIELD_LABELS[key] ?? key}:\n${value}`);
    }
    if (body.length === 0) continue;
    lines.push(`## ${section.title}`);
    lines.push(...body);
    lines.push("");
  }
  return `${lines.join("\n").trim()}\n`;
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

const LEAD_TABLE_PAGE_SIZE = 50;

function LeadTable({
  entries,
  emptyMessage,
  copiedId,
  onCopy,
  onView,
  onRemove,
  onContacted,
  onPushWin,
  startNumber = 1,
}: {
  entries: LeadListEntry[];
  emptyMessage: string;
  copiedId: string | null;
  onCopy: (entry: LeadListEntry) => void;
  onView: (entry: LeadListEntry) => void;
  onRemove?: (id: string) => void;
  onContacted: (id: string, contacted: boolean) => void;
  onPushWin?: (entry: LeadListEntry) => void;
  startNumber?: number;
}) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(entries.length / LEAD_TABLE_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);

  useEffect(() => {
    if (page >= pageCount) setPage(0);
  }, [page, pageCount]);

  const pagedEntries = useMemo(() => {
    const start = safePage * LEAD_TABLE_PAGE_SIZE;
    return entries.slice(start, start + LEAD_TABLE_PAGE_SIZE);
  }, [entries, safePage]);

  const pageOffset = safePage * LEAD_TABLE_PAGE_SIZE;

  return (
    <>
      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {pagedEntries.length === 0 ? (
          <div className="glass-panel rounded-2xl border border-white/10 px-4 py-12 text-center text-sm text-white/40">
            {emptyMessage}
          </div>
        ) : (
          pagedEntries.map((entry, index) => {
            const oneLiner = entry.oneLiner?.replace(/^\s*[*•\-–]+\s*/, "").trim();
            return (
              <div
                key={entry.id}
                className={cn(
                  "glass-panel rounded-2xl border border-white/10 p-4 transition-all hover:border-white/20",
                  entry.contacted && "opacity-60",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-mono text-white/40 bg-white/[0.04] border border-white/10 mb-1">
                      #{startNumber + pageOffset + index}
                    </span>
                    <p className="font-semibold text-white leading-snug">{entry.title}</p>
                    {oneLiner ? (
                      <p className="mt-1 line-clamp-2 text-xs text-white/60 leading-relaxed">{oneLiner}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => onContacted(entry.id, true)}
                    className="shrink-0 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/80 hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-400 transition-all cursor-pointer"
                  >
                    Contacted?
                  </button>
                </div>
                <div className="mt-2.5 space-y-0.5 text-xs text-white/50">
                  {entry.phone ? <p className="font-mono">{entry.phone}</p> : null}
                  {entry.email ? <p className="truncate font-mono">{entry.email}</p> : null}
                </div>
                <div className="mt-3.5 flex flex-wrap items-center gap-2 pt-2 border-t border-white/10">
                  {onPushWin ? (
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 gap-1 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-3 text-xs font-semibold text-white shadow-md shadow-emerald-500/20 hover:brightness-110"
                      onClick={() => onPushWin(entry)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Win
                    </Button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onCopy(entry)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-white/60 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer"
                    title="Copy"
                  >
                    {copiedId === entry.id ? (
                      <Check className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onView(entry)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-white/60 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer"
                    title="View"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  {onRemove ? (
                    <button
                      type="button"
                      onClick={() => onRemove(entry.id)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-rose-500/20 bg-rose-500/5 text-rose-400 hover:bg-rose-500/15 transition-all cursor-pointer"
                      title="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-2xl border border-white/10 glass-panel md:block shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02] text-xs font-semibold uppercase tracking-wider text-white/40">
                <th className="w-0 whitespace-nowrap px-4 py-3.5">#</th>
                <th className="min-w-[16rem] px-4 py-3.5">Title & Summary</th>
                <th className="w-[12rem] px-4 py-3.5">Contact</th>
                <th className="w-0 whitespace-nowrap px-4 py-3.5 text-center">Status</th>
                <th className="w-0 whitespace-nowrap px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {pagedEntries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-white/40">
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                pagedEntries.map((entry, index) => {
                  const oneLiner = entry.oneLiner?.replace(/^\s*[*•\-–]+\s*/, "").trim();
                  return (
                    <tr
                      key={entry.id}
                      className={cn("hover:bg-white/[0.02] transition-colors", entry.contacted && "opacity-60")}
                    >
                      <td className="whitespace-nowrap px-4 py-3 align-middle tabular-nums font-mono text-xs text-white/50">
                        {startNumber + pageOffset + index}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <p className="font-semibold leading-snug text-white">{entry.title}</p>
                        {oneLiner ? (
                          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-white/60">
                            {oneLiner}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 align-middle text-white/60">
                        <div className="space-y-0.5 text-xs leading-relaxed font-mono">
                          {entry.phone ? <p className="text-white/80">{entry.phone}</p> : null}
                          {entry.email ? <p className="truncate text-white/50">{entry.email}</p> : null}
                          {!entry.phone && !entry.email ? <p className="text-white/30">—</p> : null}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 align-middle text-center">
                        <button
                          type="button"
                          onClick={() => onContacted(entry.id, true)}
                          className={cn(
                            "rounded-xl border px-3 py-1 text-xs font-semibold transition-all cursor-pointer",
                            entry.contacted
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                              : "border-white/10 bg-white/[0.03] text-white/70 hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-400",
                          )}
                        >
                          {entry.contacted ? "Contacted" : "Mark Yes"}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 align-middle">
                        <div className="ml-auto flex w-max items-center justify-end gap-1.5">
                          {onPushWin ? (
                            <Button
                              type="button"
                              size="sm"
                              className="h-8 shrink-0 gap-1 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-3 text-xs font-semibold text-white shadow-md shadow-emerald-500/20 hover:brightness-110"
                              onClick={() => onPushWin(entry)}
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Win
                            </Button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => onCopy(entry)}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-white/60 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer"
                            title="Copy full lead for ChatGPT"
                          >
                            {copiedId === entry.id ? (
                              <Check className="h-4 w-4 text-emerald-400" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => onView(entry)}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-white/60 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer"
                            title="View details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {onRemove ? (
                            <button
                              type="button"
                              onClick={() => onRemove(entry.id)}
                              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-rose-500/20 bg-rose-500/5 text-rose-400 hover:bg-rose-500/15 transition-all cursor-pointer"
                              title="Remove"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : null}
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

      {pageCount > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 px-2 pt-2 text-xs text-white/50">
          <p>
            Showing {pageOffset + 1}–{Math.min(entries.length, pageOffset + LEAD_TABLE_PAGE_SIZE)} of {entries.length} leads
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
            >
              Previous
            </button>
            <span className="font-mono text-white/60">
              {safePage + 1} / {pageCount}
            </span>
            <button
              type="button"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function SalesLeadListPage() {
  const {
    entries: leadList,
    loading,
    error,
    setContacted: patchContacted,
    importEntries,
  } = useLeadList();
  const [query, setQuery] = useState("");
  const [trackFilter, setTrackFilter] = useState<TrackFilter>("all");
  const [selected, setSelected] = useState<LeadListEntry | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /** Open queue only — contacted leads live on /contacted. */
  const openLeads = useMemo(
    () => leadList.filter((entry) => entry.contacted !== true),
    [leadList],
  );

  const filtered = useMemo(
    () => filterLeadList(openLeads, query, trackFilter),
    [openLeads, query, trackFilter],
  );
  const techLeads = useMemo(
    () => sortLeadEntries(filtered.filter((entry) => classifyLeadListTrack(entry) === "tech")),
    [filtered],
  );
  const nonTechLeads = useMemo(
    () => sortLeadEntries(filtered.filter((entry) => classifyLeadListTrack(entry) === "non_tech")),
    [filtered],
  );
  const techCount = useMemo(
    () => openLeads.filter((entry) => classifyLeadListTrack(entry) === "tech").length,
    [openLeads],
  );
  const nonTechCount = openLeads.length - techCount;

  const setContacted = (id: string, contacted: boolean) => {
    void patchContacted(id, contacted)
      .then(() => {
        if (contacted) toast.success("Moved to Contacted.");
      })
      .catch(() => toast.error("Could not update contacted status."));
    if (selected?.id === id) {
      if (contacted) setSelected(null);
      else setSelected((prev) => (prev ? { ...prev, contacted } : prev));
    }
  };

  const handleCopy = async (entry: LeadListEntry) => {
    const ok = await copyText(formatLeadForCopy(entry));
    if (!ok) {
      toast.error("Could not copy to clipboard.");
      return;
    }
    setCopiedId(entry.id);
    toast.success(`Copied ${entry.externalId} — paste into ChatGPT`);
    window.setTimeout(() => setCopiedId((current) => (current === entry.id ? null : current)), 2000);
  };

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const parsed = await parseLeadListFile(file);
      await importEntries(parsed.entries);
      const importedTech = parsed.entries.filter(
        (entry) => classifyLeadListTrack(entry) === "tech",
      ).length;
      const importedNonTech = parsed.entries.length - importedTech;
      toast.success(
        `Imported ${parsed.rowCount} leads (${importedTech} tech · ${importedNonTech} non-tech) from ${parsed.sheetName}`,
      );
    } catch (err) {
      logClientError("leadList.upload", err);
      toast.error(err instanceof Error ? err.message : "Could not import chat export.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

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
        title="Lead List"
        description="Open leads only. Mark Yes to move them to Contacted — win from there."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".zip,.txt,.md,.xlsx,.xls,application/zip,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="sr-only"
              onChange={(e) => void handleUpload(e.target.files?.[0])}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              {uploading ? "Uploading…" : "Upload chat"}
            </Button>
          </div>
        }
      />
      <LeadListFilters
        query={query}
        setQuery={setQuery}
        trackFilter={trackFilter}
        setTrackFilter={setTrackFilter}
        leadList={openLeads}
        filteredCount={filtered.length}
        techCount={techCount}
        nonTechCount={nonTechCount}
      />
      {openLeads.length === 0 ? (
        <div className="glass-panel rounded-2xl border border-dashed border-white/10 py-16 text-center text-sm text-white/40">
          {leadList.length === 0
            ? "No leads yet. Upload a WhatsApp Inner Circle chat export (.zip)."
            : "All open leads are contacted. See Contacted for follow-ups and wins."}
        </div>
      ) : (
        <LeadListSections
          trackFilter={trackFilter}
          techLeads={techLeads}
          nonTechLeads={nonTechLeads}
          copiedId={copiedId}
          onCopy={(entry) => void handleCopy(entry)}
          onView={setSelected}
          onContacted={setContacted}
        />
      )}
      <LeadDetailDialog
        selected={selected}
        onClose={() => setSelected(null)}
        copiedId={copiedId}
        onCopy={(entry) => void handleCopy(entry)}
        onContacted={setContacted}
      />
    </div>
  );
}

function filterLeadList(leadList: LeadListEntry[], query: string, trackFilter: TrackFilter) {
  const q = query.trim().toLowerCase();
  return leadList.filter((entry) => {
    if (q) {
      const hay = [
        entry.externalId,
        entry.title,
        entry.oneLiner,
        entry.phone,
        entry.email,
        entry.category,
        entry.location,
        entry.intent,
        entry.projectType,
        entry.technicalStack,
        entry.contacted ? "contacted yes" : "contacted no",
        classifyLeadListTrack(entry) === "tech" ? "tech" : "non tech non-tech",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (trackFilter === "all") return true;
    return classifyLeadListTrack(entry) === trackFilter;
  });
}

function LeadListFilters({
  query,
  setQuery,
  trackFilter,
  setTrackFilter,
  leadList,
  filteredCount,
  techCount,
  nonTechCount,
}: {
  query: string;
  setQuery: (value: string) => void;
  trackFilter: TrackFilter;
  setTrackFilter: (value: TrackFilter) => void;
  leadList: LeadListEntry[];
  filteredCount: number;
  techCount: number;
  nonTechCount: number;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="relative w-full sm:max-w-sm">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title, phone, email, category…"
          className="pl-10 rounded-xl border-white/10 bg-white/[0.04] text-white placeholder:text-white/40 focus:border-[#ff6b2b]/50 focus:ring-1 focus:ring-[#ff6b2b]"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { id: "all", label: `All (${leadList.length})` },
            { id: "tech", label: `Tech (${techCount})` },
            { id: "non_tech", label: `Non-tech (${nonTechCount})` },
          ] as const
        ).map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setTrackFilter(option.id)}
            className={cn(
              "rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer",
              trackFilter === option.id
                ? "bg-gradient-to-r from-[#ff6b2b]/15 to-[#ff6b2b]/5 text-[#ff6b2b] border-[#ff6b2b]/30 shadow-[0_0_12px_rgba(255,107,43,0.15)]"
                : "border-white/10 bg-white/[0.02] text-white/60 hover:text-white hover:bg-white/[0.06]",
            )}
          >
            {option.label}
          </button>
        ))}
        <p className="w-full text-xs text-white/50 sm:w-auto font-mono">
          {filteredCount} showing
          {leadList.length > 0
            ? ` · ${leadList.filter((entry) => entry.contacted).length} contacted`
            : ""}
        </p>
      </div>
    </div>
  );
}

function LeadListSections({
  trackFilter,
  techLeads,
  nonTechLeads,
  copiedId,
  onCopy,
  onView,
  onRemove,
  onContacted,
  onPushWin,
}: {
  trackFilter: TrackFilter;
  techLeads: LeadListEntry[];
  nonTechLeads: LeadListEntry[];
  copiedId: string | null;
  onCopy: (entry: LeadListEntry) => void;
  onView: (entry: LeadListEntry) => void;
  onRemove?: (id: string) => void;
  onContacted: (id: string, contacted: boolean) => void;
  onPushWin?: (entry: LeadListEntry) => void;
}) {
  const showTech = trackFilter !== "non_tech";
  const showNonTech = trackFilter !== "tech";

  return (
    <div className="space-y-10">
      {showTech ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-white/10 pb-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                Track
              </p>
              <h2 className="text-lg font-bold text-white">Tech Leads</h2>
              <p className="text-xs text-white/50">
                Dev, SEO, web/UI, WordPress, Shopify, CMS
              </p>
            </div>
            <p className="text-xs tabular-nums font-mono text-white/50">{techLeads.length} leads</p>
          </div>
          <LeadTable
            entries={techLeads}
            emptyMessage="No tech leads match this filter."
            copiedId={copiedId}
            onCopy={onCopy}
            onView={onView}
            onRemove={onRemove}
            onContacted={onContacted}
            onPushWin={onPushWin}
            startNumber={1}
          />
        </section>
      ) : null}

      {showTech && showNonTech ? (
        <div className="relative py-1" aria-hidden>
          <div className="border-t border-dashed border-white/10" />
        </div>
      ) : null}

      {showNonTech ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-white/10 pb-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                Track
              </p>
              <h2 className="text-lg font-bold text-white">Non-Tech Leads</h2>
              <p className="text-xs text-white/50">
                Ads, branding, video, social, PR, marketing
              </p>
            </div>
            <p className="text-xs tabular-nums font-mono text-white/50">{nonTechLeads.length} leads</p>
          </div>
          <LeadTable
            entries={nonTechLeads}
            emptyMessage="No non-tech leads match this filter."
            copiedId={copiedId}
            onCopy={onCopy}
            onView={onView}
            onRemove={onRemove}
            onContacted={onContacted}
            onPushWin={onPushWin}
            startNumber={1}
          />
        </section>
      ) : null}
    </div>
  );
}

function LeadDetailDialog({
  selected,
  onClose,
  copiedId,
  onCopy,
  onContacted,
  onRecordWin,
}: {
  selected: LeadListEntry | null;
  onClose: () => void;
  copiedId: string | null;
  onCopy: (entry: LeadListEntry) => void;
  onContacted: (id: string, contacted: boolean) => void;
  onRecordWin?: (entry: LeadListEntry) => void;
}) {
  return (
    <Dialog open={selected != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[min(92vh,900px)] overflow-y-auto sm:max-w-3xl rounded-3xl border border-white/10 bg-[#0e0e14]/95 backdrop-blur-2xl text-white shadow-2xl">
        {selected ? (
          <>
            <DialogHeader>
              <DialogTitle className="pr-6 text-xl font-bold text-white">{selected.title}</DialogTitle>
              <DialogDescription className="text-white/60">
                {[
                  selected.externalId,
                  classifyLeadListTrack(selected) === "tech" ? "Tech" : "Non-tech",
                  selected.leadScore != null ? `Score ${selected.leadScore}` : null,
                  selected.contacted ? "Contacted" : "Not contacted",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </DialogDescription>
            </DialogHeader>
            <div className="mb-4 flex flex-wrap gap-2 pt-2">
              <Button type="button" size="sm" variant="outline" className="rounded-xl border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]" onClick={() => onCopy(selected)}>
                {copiedId === selected.id ? (
                  <>
                    <Check className="mr-1.5 h-4 w-4 text-emerald-400" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-1.5 h-4 w-4" /> Copy for ChatGPT
                  </>
                )}
              </Button>
              {onRecordWin ? (
                <Button type="button" size="sm" className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold hover:brightness-110 shadow-md shadow-emerald-500/20" onClick={() => onRecordWin(selected)}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Win
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                className="rounded-xl bg-gradient-to-r from-[#ff6b2b] to-[#f04400] text-white font-semibold hover:brightness-110 shadow-lg shadow-[#ff6b2b]/20"
                onClick={() => onContacted(selected.id, true)}
                disabled={selected.contacted === true}
              >
                Yes — mark contacted
              </Button>
            </div>
            <div className="space-y-5">
              {DETAIL_SECTIONS.map((section) => {
                const rows = section.keys
                  .map((key) => {
                    const value = formatFieldValue(selected, key);
                    if (!value) return null;
                    return { key, label: FIELD_LABELS[key] ?? key, value };
                  })
                  .filter(Boolean) as { key: string; label: string; value: string }[];
                if (rows.length === 0) return null;
                return (
                  <section key={section.title} className="glass-panel rounded-2xl border border-white/10 p-4 space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#ff6b2b]">
                      {section.title}
                    </h3>
                    <dl className="grid gap-3 sm:grid-cols-2">
                      {rows.map((row) => (
                        <div key={row.key} className={row.value.length > 80 ? "sm:col-span-2" : ""}>
                          <dt className="text-[11px] font-semibold text-white/40">
                            {row.label}
                          </dt>
                          <dd className="mt-0.5 whitespace-pre-wrap text-sm text-white/90 leading-relaxed font-normal">
                            {row.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                );
              })}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AdminLeadListPage() {
  const { ops, persist, loading, ready } = useOperations();
  const [query, setQuery] = useState("");
  const [trackFilter, setTrackFilter] = useState<TrackFilter>("all");
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<LeadListEntry | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const leadList = ops.leadList ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leadList.filter((entry) => {
      if (q) {
        const hay = [
          entry.externalId,
          entry.title,
          entry.oneLiner,
          entry.phone,
          entry.email,
          entry.category,
          entry.location,
          entry.intent,
          entry.projectType,
          entry.technicalStack,
          entry.contacted ? "contacted yes" : "contacted no",
          classifyLeadListTrack(entry) === "tech" ? "tech" : "non tech non-tech",
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (trackFilter === "all") return true;
      return classifyLeadListTrack(entry) === trackFilter;
    });
  }, [leadList, query, trackFilter]);

  const techLeads = useMemo(
    () => sortLeadEntries(filtered.filter((entry) => classifyLeadListTrack(entry) === "tech")),
    [filtered],
  );
  const nonTechLeads = useMemo(
    () =>
      sortLeadEntries(filtered.filter((entry) => classifyLeadListTrack(entry) === "non_tech")),
    [filtered],
  );

  const techCount = useMemo(
    () => leadList.filter((entry) => classifyLeadListTrack(entry) === "tech").length,
    [leadList],
  );
  const nonTechCount = leadList.length - techCount;

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const parsed = await parseLeadListFile(file);
      const next = mergeLeadListEntries(leadList, parsed.entries);
      await persist({ ...ops, leadList: next });
      const importedTech = parsed.entries.filter(
        (entry) => classifyLeadListTrack(entry) === "tech",
      ).length;
      const importedNonTech = parsed.entries.length - importedTech;
      toast.success(
        `Imported ${parsed.rowCount} leads (${importedTech} tech · ${importedNonTech} non-tech) from ${parsed.sheetName}`,
      );
    } catch (error) {
      logClientError("leadList.upload", error);
      toast.error(error instanceof Error ? error.message : "Could not import file.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeEntry = (id: string) => {
    if (!confirm("Remove this lead from the list?")) return;
    void persist(
      { ...ops, leadList: leadList.filter((entry) => entry.id !== id) },
      { deleteIds: { leadList: [id] } },
    );
    if (selected?.id === id) setSelected(null);
  };

  const clearAll = () => {
    if (leadList.length === 0) return;
    if (!confirm(`Remove all ${leadList.length} leads from this list?`)) return;
    void persist(
      { ...ops, leadList: [] },
      { deleteIds: { leadList: leadList.map((entry) => entry.id) } },
    );
    setSelected(null);
  };

  const setContacted = (id: string, contacted: boolean) => {
    const next = leadList.map((entry) => (entry.id === id ? { ...entry, contacted } : entry));
    void persist({ ...ops, leadList: next });
    if (selected?.id === id) setSelected((prev) => (prev ? { ...prev, contacted } : prev));
  };

  const handleCopy = async (entry: LeadListEntry) => {
    const ok = await copyText(formatLeadForCopy(entry));
    if (!ok) {
      toast.error("Could not copy to clipboard.");
      return;
    }
    setCopiedId(entry.id);
    toast.success(`Copied ${entry.externalId} — paste into ChatGPT`);
    window.setTimeout(() => setCopiedId((current) => (current === entry.id ? null : current)), 2000);
  };

  if (loading && !ready) return <OperationsLoading />;

  return (
    <div className="space-y-6">
      <OperationsPageHeader
        title="Lead List"
        description="Upload Inner Circle Excel or WhatsApp chat export. Separate from Pipeline — review here first."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".zip,.txt,.md,.xlsx,.xls,application/zip,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="sr-only"
              onChange={(e) => void handleUpload(e.target.files?.[0])}
            />
            <Button
              type="button"
              size="sm"
              className="h-10 gap-2 rounded-xl bg-gradient-to-r from-[#ff6b2b] to-[#f04400] px-4 font-semibold text-white shadow-lg shadow-[#ff6b2b]/25 hover:brightness-110 active:scale-95 transition-all"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              {uploading ? "Uploading…" : "Upload chat"}
            </Button>
            {leadList.length > 0 ? (
              <Button type="button" size="sm" variant="outline" className="rounded-xl border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]" onClick={clearAll}>
                Clear list
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, phone, email, category…"
            className="pl-10 rounded-xl border-white/10 bg-white/[0.04] text-white placeholder:text-white/40 focus:border-[#ff6b2b]/50 focus:ring-1 focus:ring-[#ff6b2b]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { id: "all", label: `All (${leadList.length})` },
              { id: "tech", label: `Tech (${techCount})` },
              { id: "non_tech", label: `Non-tech (${nonTechCount})` },
            ] as const
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setTrackFilter(option.id)}
              className={cn(
                "rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer",
                trackFilter === option.id
                  ? "bg-gradient-to-r from-[#ff6b2b]/15 to-[#ff6b2b]/5 text-[#ff6b2b] border-[#ff6b2b]/30 shadow-[0_0_12px_rgba(255,107,43,0.15)]"
                  : "border-white/10 bg-white/[0.02] text-white/60 hover:text-white hover:bg-white/[0.06]",
              )}
            >
              {option.label}
            </button>
          ))}
          <p className="text-xs text-white/50 font-mono">
            {filtered.length} showing
            {leadList.length > 0
              ? ` · ${leadList.filter((entry) => entry.contacted).length} contacted`
              : ""}
          </p>
        </div>
      </div>

      {leadList.length === 0 ? (
        <div className="glass-panel rounded-2xl border border-dashed border-white/10 py-16 text-center text-sm text-white/40">
          No leads yet. Upload a WhatsApp chat export (.zip) or Inner Circle Excel.
        </div>
      ) : (
        <div className="space-y-10">
          {trackFilter !== "non_tech" ? (
            <section className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-2 border-b border-white/10 pb-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                    Track
                  </p>
                  <h2 className="text-lg font-bold text-white">Tech Leads</h2>
                  <p className="text-xs text-white/50">
                    Dev, SEO, web/UI, WordPress, Shopify, CMS
                  </p>
                </div>
                <p className="text-xs tabular-nums font-mono text-white/50">{techLeads.length} leads</p>
              </div>
              <LeadTable
                entries={techLeads}
                emptyMessage="No tech leads match this filter."
                copiedId={copiedId}
                onCopy={(entry) => void handleCopy(entry)}
                onView={setSelected}
                onRemove={removeEntry}
                onContacted={setContacted}
                startNumber={1}
              />
            </section>
          ) : null}

          {trackFilter === "all" ? (
            <div className="relative py-1" aria-hidden>
              <div className="border-t border-dashed border-white/10" />
            </div>
          ) : null}

          {trackFilter !== "tech" ? (
            <section className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-2 border-b border-white/10 pb-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                    Track
                  </p>
                  <h2 className="text-lg font-bold text-white">Non-Tech Leads</h2>
                  <p className="text-xs text-white/50">
                    Ads, branding, video, social, PR, marketing
                  </p>
                </div>
                <p className="text-xs tabular-nums font-mono text-white/50">{nonTechLeads.length} leads</p>
              </div>
              <LeadTable
                entries={nonTechLeads}
                emptyMessage="No non-tech leads match this filter."
                copiedId={copiedId}
                onCopy={(entry) => void handleCopy(entry)}
                onView={setSelected}
                onRemove={removeEntry}
                onContacted={setContacted}
                startNumber={1}
              />
            </section>
          ) : null}
        </div>
      )}

      <Dialog open={selected != null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[min(92vh,900px)] overflow-y-auto sm:max-w-3xl rounded-3xl border border-white/10 bg-[#0e0e14]/95 backdrop-blur-2xl text-white shadow-2xl">
          {selected ? (
            <>
              <DialogHeader>
                <DialogTitle className="pr-6 text-xl font-bold text-white">{selected.title}</DialogTitle>
                <DialogDescription className="text-white/60">
                  {[
                    selected.externalId,
                    classifyLeadListTrack(selected) === "tech" ? "Tech" : "Non-tech",
                    selected.leadScore != null ? `Score ${selected.leadScore}` : null,
                    selected.contacted ? "Contacted" : "Not contacted",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </DialogDescription>
              </DialogHeader>
              <div className="mb-4 flex flex-wrap gap-2 pt-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-xl border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                  onClick={() => void handleCopy(selected)}
                >
                  {copiedId === selected.id ? (
                    <>
                      <Check className="mr-1.5 h-4 w-4 text-emerald-400" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1.5 h-4 w-4" /> Copy for ChatGPT
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="rounded-xl bg-gradient-to-r from-[#ff6b2b] to-[#f04400] text-white font-semibold hover:brightness-110 shadow-lg shadow-[#ff6b2b]/20"
                  onClick={() => setContacted(selected.id, true)}
                  disabled={selected.contacted === true}
                >
                  Yes — mark contacted
                </Button>
              </div>
              <div className="space-y-5">
                {DETAIL_SECTIONS.map((section) => {
                  const rows = section.keys
                    .map((key) => {
                      const value = formatFieldValue(selected, key);
                      if (!value) return null;
                      return { key, label: FIELD_LABELS[key] ?? key, value };
                    })
                    .filter(Boolean) as { key: string; label: string; value: string }[];
                  if (rows.length === 0) return null;
                  return (
                    <section key={section.title} className="glass-panel rounded-2xl border border-white/10 p-4 space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#ff6b2b]">
                        {section.title}
                      </h3>
                      <dl className="grid gap-3 sm:grid-cols-2">
                        {rows.map((row) => (
                          <div key={row.key} className={row.value.length > 80 ? "sm:col-span-2" : ""}>
                            <dt className="text-[11px] font-semibold text-white/40">
                              {row.label}
                            </dt>
                            <dd className="mt-0.5 whitespace-pre-wrap text-sm text-white/90 leading-relaxed font-normal">
                              {row.value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  );
                })}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
