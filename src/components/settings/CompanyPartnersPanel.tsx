import { useMemo, useState } from "react";
import { ChevronRight, Mail, Phone, Plus, Trash2 } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useOperations } from "@/hooks/use-operations";
import type { CompanyMember, Founder } from "@/lib/types";
import { cn } from "@/lib/utils";

const SLICE_COLORS = [
  "#38bdf8",
  "#34d399",
  "#fbbf24",
  "#fb7185",
  "#2dd4bf",
  "#fb923c",
  "#a3e635",
  "#67e8f9",
  "#f472b6",
  "#94a3b8",
];

type CapSlice = { id: string; name: string; share: number; fill: string };

function memberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function CapTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: CapSlice }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-foreground">{row.name}</p>
      <p className="mt-1 tabular-nums text-muted-foreground">{row.share}% equity</p>
    </div>
  );
}

function CapTableChart({ slices, allocated }: { slices: CapSlice[]; allocated: number }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const remainder = Math.max(0, Math.round((100 - allocated) * 10) / 10);
  const chartData =
    remainder > 0.05
      ? [
          ...slices,
          {
            id: "__unallocated",
            name: "Unallocated",
            share: remainder,
            fill: "hsl(var(--muted-foreground) / 0.28)",
          },
        ]
      : slices;

  if (slices.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No shares set yet. Open a partner to add their equity %.
      </p>
    );
  }

  return (
    <div className="grid gap-1 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,0.85fr)]">
      <div className="relative flex min-h-[220px] items-center justify-center sm:min-h-[260px]">
        <ResponsiveContainer width="100%" height="100%" minHeight={220}>
          <PieChart>
            <Pie
              data={chartData}
              dataKey="share"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="54%"
              outerRadius="76%"
              paddingAngle={chartData.length > 1 ? 2 : 0}
              stroke="hsl(var(--background))"
              strokeWidth={2}
              onMouseEnter={(_, index) => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              {chartData.map((row, index) => (
                <Cell
                  key={row.id}
                  fill={row.fill}
                  opacity={activeIndex === null || activeIndex === index ? 1 : 0.35}
                  style={{ outline: "none", cursor: "pointer" }}
                />
              ))}
            </Pie>
            <Tooltip content={<CapTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Allocated
          </p>
          <p className="text-lg font-semibold tabular-nums text-foreground">{allocated}%</p>
        </div>
      </div>
      <ul className="flex flex-col justify-center gap-0.5 px-1 py-2 lg:py-4">
        {chartData.map((row, index) => (
          <li key={row.id}>
            <div
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2 py-1.5",
                activeIndex === index && "bg-muted/50",
              )}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: row.fill }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{row.name}</span>
              <span className="text-sm font-medium tabular-nums text-muted-foreground">
                {row.share}%
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{children}</span>;
}

/** Cap table + quiet partner list; edit opens a side drawer. */
export function CompanyPartnersPanel({
  partners,
  onAdd,
  onUpdate,
  onRemove,
}: {
  partners: CompanyMember[];
  onAdd: () => void;
  onUpdate: (
    id: string,
    patch: Partial<Pick<CompanyMember, "name" | "email" | "phone" | "role">>,
  ) => void;
  onRemove: (id: string) => void;
}) {
  const { ops, persist } = useOperations();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sharePct, setSharePct] = useState("");
  const [notes, setNotes] = useState("");

  const founders = ops.founders ?? [];
  const founderById = useMemo(
    () => new Map(founders.map((founder) => [founder.id, founder])),
    [founders],
  );

  const activeMember = partners.find((p) => p.id === activeId) ?? null;

  const capSlices = useMemo(() => {
    const rows: CapSlice[] = [];
    let colorIndex = 0;
    const byId = new Map(founders.map((f) => [f.id, f]));
    for (const member of partners) {
      const founder = byId.get(member.id);
      const share = founder?.sharePercentage ?? 0;
      if (share <= 0) continue;
      rows.push({
        id: member.id,
        name: member.name.trim() || founder?.name || "Partner",
        share,
        fill: SLICE_COLORS[colorIndex++ % SLICE_COLORS.length],
      });
    }
    for (const founder of founders) {
      if (rows.some((r) => r.id === founder.id) || founder.sharePercentage <= 0) continue;
      rows.push({
        id: founder.id,
        name: founder.name.trim() || "Partner",
        share: founder.sharePercentage,
        fill: SLICE_COLORS[colorIndex++ % SLICE_COLORS.length],
      });
    }
    return rows.sort((a, b) => b.share - a.share || a.name.localeCompare(b.name));
  }, [partners, founders]);

  const allocated = useMemo(
    () => Math.round(capSlices.reduce((sum, row) => sum + row.share, 0) * 10) / 10,
    [capSlices],
  );

  const openPartner = (member: CompanyMember) => {
    const founder = founderById.get(member.id);
    setActiveId(member.id);
    setSharePct(founder ? String(founder.sharePercentage) : "0");
    setNotes(founder?.notes ?? "");
  };

  const closeDrawer = () => setActiveId(null);

  const saveShare = () => {
    if (!activeMember) return;
    const pctNum = Number(sharePct);
    if (isNaN(pctNum) || pctNum < 0 || pctNum > 100) {
      alert("Share % must be between 0 and 100.");
      return;
    }
    const existing = founderById.get(activeMember.id);
    if (existing) {
      persist({
        ...ops,
        founders: founders.map((f) =>
          f.id === existing.id
            ? { ...f, sharePercentage: pctNum, notes: notes.trim() || undefined }
            : f,
        ),
      });
      return;
    }
    const created: Founder = {
      id: activeMember.id,
      name: activeMember.name,
      sharePercentage: pctNum,
      notes: notes.trim() || undefined,
    };
    persist({ ...ops, founders: [...founders, created] });
  };

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Partners</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Equity first. Open anyone to edit contact or share %.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>

      {/* Cap table — hero */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium text-foreground">Cap table</h3>
          {allocated > 0 && (
            <p className="text-xs text-muted-foreground">
              {allocated > 100 ? (
                <span className="text-amber-500">Over 100% — fix shares</span>
              ) : allocated < 99.9 ? (
                <span>{Math.round((100 - allocated) * 10) / 10}% unallocated</span>
              ) : (
                <span>Fully allocated</span>
              )}
            </p>
          )}
        </div>
        <CapTableChart slices={capSlices} allocated={allocated} />
      </section>

      {/* Quiet list */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">Directory</h3>
        <ul className="divide-y divide-border/80 border-y border-border/80">
          {partners.length === 0 ? (
            <li className="py-8 text-center text-sm text-muted-foreground">No partners yet.</li>
          ) : (
            partners.map((member) => {
              const founder = founderById.get(member.id);
              return (
                <li key={member.id}>
                  <button
                    type="button"
                    onClick={() => openPartner(member)}
                    className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-muted/30"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                      {memberInitials(member.name || "?")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {member.name || "Unnamed"}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {member.role || "Partner"}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                      {founder ? `${founder.sharePercentage}%` : "—"}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/70" />
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </section>

      <Sheet open={Boolean(activeMember)} onOpenChange={(open) => !open && closeDrawer()}>
        {activeMember && (
          <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
            <SheetHeader className="border-b border-border px-6 py-5 text-left">
              <SheetTitle>{activeMember.name || "Partner"}</SheetTitle>
              <SheetDescription>Contact details and equity share.</SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <label className="block">
                <FieldLabel>Name</FieldLabel>
                <Input
                  value={activeMember.name}
                  onChange={(e) => onUpdate(activeMember.id, { name: e.target.value })}
                />
              </label>
              <label className="block">
                <FieldLabel>Role</FieldLabel>
                <Input
                  value={activeMember.role || ""}
                  placeholder="Partner"
                  onChange={(e) => onUpdate(activeMember.id, { role: e.target.value })}
                />
              </label>
              <label className="block">
                <FieldLabel>Email</FieldLabel>
                <Input
                  type="email"
                  value={activeMember.email}
                  onChange={(e) => onUpdate(activeMember.id, { email: e.target.value })}
                />
              </label>
              <label className="block">
                <FieldLabel>Phone</FieldLabel>
                <Input
                  value={activeMember.phone}
                  onChange={(e) => onUpdate(activeMember.id, { phone: e.target.value })}
                />
              </label>

              <div className="border-t border-border pt-5">
                <label className="block">
                  <FieldLabel>Equity share (%)</FieldLabel>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="any"
                    value={sharePct}
                    onChange={(e) => setSharePct(e.target.value)}
                  />
                </label>
                <label className="mt-4 block">
                  <FieldLabel>Notes</FieldLabel>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional equity notes…"
                    rows={3}
                  />
                </label>
                <Button type="button" className="mt-3 w-full" onClick={saveShare}>
                  Save share
                </Button>
              </div>

              <div className="flex flex-wrap gap-3 border-t border-border pt-4">
                {activeMember.email && (
                  <a
                    href={`mailto:${activeMember.email}`}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    Email
                  </a>
                )}
                {activeMember.phone && (
                  <a
                    href={`tel:${activeMember.phone.replace(/\s/g, "")}`}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    Call
                  </a>
                )}
              </div>
            </div>

            <SheetFooter className="border-t border-border px-6 py-4 sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                className="gap-1.5 text-destructive hover:text-destructive"
                onClick={() => {
                  onRemove(activeMember.id);
                  closeDrawer();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </Button>
              <Button type="button" variant="outline" onClick={closeDrawer}>
                Done
              </Button>
            </SheetFooter>
          </SheetContent>
        )}
      </Sheet>
    </div>
  );
}
