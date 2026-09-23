import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Copy, Eye, Search, Trash2, Upload } from "lucide-react";
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
import { useOperations } from "@/hooks/use-operations";
import { logClientError } from "@/lib/client-logger";
import { mergeLeadListEntries, parseLeadListWorkbook, classifyLeadListTrack } from "@/lib/lead-list-import";
import type { LeadListEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/lead-list")({ component: LeadListPage });

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

function LeadTable({
  entries,
  emptyMessage,
  copiedId,
  onCopy,
  onView,
  onRemove,
  onContacted,
}: {
  entries: LeadListEntry[];
  emptyMessage: string;
  copiedId: string | null;
  onCopy: (entry: LeadListEntry) => void;
  onView: (entry: LeadListEntry) => void;
  onRemove: (id: string) => void;
  onContacted: (id: string, contacted: boolean) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] table-auto border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Contacted</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr
                  key={entry.id}
                  className={cn("hover:bg-muted/30", entry.contacted && "opacity-70")}
                >
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                    {entry.externalId}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-foreground">
                    {entry.leadScore != null ? entry.leadScore.toFixed(1) : "—"}
                  </td>
                  <td className="max-w-[22rem] px-4 py-3">
                    <p className="font-medium text-foreground">{entry.title}</p>
                    {entry.oneLiner ? (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {entry.oneLiner}
                      </p>
                    ) : null}
                  </td>
                  <td className="max-w-[12rem] px-4 py-3 text-muted-foreground break-words">
                    <div className="space-y-0.5 text-xs">
                      {entry.phone ? <p>{entry.phone}</p> : null}
                      {entry.email ? <p className="break-all">{entry.email}</p> : null}
                      {!entry.phone && !entry.email ? "—" : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="inline-flex rounded-md border border-border p-0.5">
                      <button
                        type="button"
                        onClick={() => onContacted(entry.id, true)}
                        className={cn(
                          "rounded px-2 py-1 text-[11px] font-medium transition-colors",
                          entry.contacted
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => onContacted(entry.id, false)}
                        className={cn(
                          "rounded px-2 py-1 text-[11px] font-medium transition-colors",
                          !entry.contacted
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        No
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onCopy(entry)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
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
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                        title="View details"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemove(entry.id)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-400"
                        title="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
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
  );
}

function LeadListPage() {
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
      const parsed = await parseLeadListWorkbook(file);
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
      toast.error(error instanceof Error ? error.message : "Could not import spreadsheet.");
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
        description="Upload Inner Circle / Excel lead intelligence. Separate from Pipeline — review everything here first."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="sr-only"
              onChange={(e) => void handleUpload(e.target.files?.[0])}
            />
            <Button
              type="button"
              size="sm"
              className="h-10 gap-1.5 rounded-lg px-4"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              {uploading ? "Uploading…" : "Upload Excel"}
            </Button>
            {leadList.length > 0 ? (
              <Button type="button" size="sm" variant="outline" onClick={clearAll}>
                Clear list
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, phone, email, category…"
            className="pl-9"
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
                "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                trackFilter === option.id
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
          <p className="text-xs text-muted-foreground">
            {filtered.length} showing
            {leadList.length > 0
              ? ` · ${leadList.filter((entry) => entry.contacted).length} contacted`
              : ""}
          </p>
        </div>
      </div>

      {leadList.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          No leads yet. Upload the Inner Circle Excel (Lead Master sheet) to populate this list.
        </div>
      ) : (
        <div className="space-y-8">
          {trackFilter !== "non_tech" ? (
            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Tech leads</h2>
                <p className="text-xs text-muted-foreground">
                  Dev, SEO, web/UI design, WordPress · {techLeads.length}
                </p>
              </div>
              <LeadTable
                entries={techLeads}
                emptyMessage="No tech leads match this filter."
                copiedId={copiedId}
                onCopy={(entry) => void handleCopy(entry)}
                onView={setSelected}
                onRemove={removeEntry}
                onContacted={setContacted}
              />
            </section>
          ) : null}

          {trackFilter !== "tech" ? (
            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Non-tech leads</h2>
                <p className="text-xs text-muted-foreground">
                  Ads, branding, video, social, PR · {nonTechLeads.length}
                </p>
              </div>
              <LeadTable
                entries={nonTechLeads}
                emptyMessage="No non-tech leads match this filter."
                copiedId={copiedId}
                onCopy={(entry) => void handleCopy(entry)}
                onView={setSelected}
                onRemove={removeEntry}
                onContacted={setContacted}
              />
            </section>
          ) : null}
        </div>
      )}

      <Dialog open={selected != null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[min(92vh,900px)] overflow-y-auto sm:max-w-3xl">
          {selected ? (
            <>
              <DialogHeader>
                <DialogTitle className="pr-6">{selected.title}</DialogTitle>
                <DialogDescription>
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
              <div className="mb-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void handleCopy(selected)}
                >
                  {copiedId === selected.id ? (
                    <>
                      <Check className="mr-1.5 h-4 w-4" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1.5 h-4 w-4" /> Copy for ChatGPT
                    </>
                  )}
                </Button>
                <div className="inline-flex rounded-md border border-border p-0.5">
                  <button
                    type="button"
                    onClick={() => setContacted(selected.id, true)}
                    className={cn(
                      "rounded px-2.5 py-1.5 text-xs font-medium",
                      selected.contacted
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "text-muted-foreground",
                    )}
                  >
                    Contacted: Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => setContacted(selected.id, false)}
                    className={cn(
                      "rounded px-2.5 py-1.5 text-xs font-medium",
                      !selected.contacted ? "bg-muted text-foreground" : "text-muted-foreground",
                    )}
                  >
                    No
                  </button>
                </div>
              </div>
              <div className="space-y-6">
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
                    <section key={section.title} className="space-y-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {section.title}
                      </h3>
                      <dl className="space-y-3">
                        {rows.map((row) => (
                          <div key={row.key}>
                            <dt className="text-[11px] font-medium text-muted-foreground">
                              {row.label}
                            </dt>
                            <dd className="mt-1 whitespace-pre-wrap text-sm text-foreground">
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
