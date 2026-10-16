import { memo, useCallback, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  ChevronDown,
  ChevronRight,
  User,
  Phone,
  Edit2,
  Trash2,
  Undo2,
} from "lucide-react";
import { LEAD_STATUSES, leadStatusLabel } from "@/lib/lead-utils";
import { formatINRWhole } from "@/lib/invoice-calc";
import { DEFAULT_COMPANY } from "@/lib/constants";
import type { Lead, LeadStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const DealCard = memo(function DealCard({
  lead,
  expanded,
  onToggle,
  onEdit,
  onRemove,
  onMove,
  onReopen,
  memberName,
}: {
  lead: Lead;
  expanded: boolean;
  onToggle: (id: string) => void;
  onEdit: (lead: Lead) => void;
  onRemove: (id: string) => void;
  onMove: (lead: Lead, direction: "left" | "right") => void;
  onReopen: (id: string) => void;
  memberName: string;
}) {
  const hasStats = lead.expectedRevenue != null || lead.probability != null;
  const currentIndex = LEAD_STATUSES.indexOf(lead.status);

  return (
    <div
      className={cn(
        "glass-card rounded-2xl border border-white/10 transition-[border-color,box-shadow,background-color] duration-150 hover:border-orange-500/30 hover:shadow-xl",
        expanded ? "p-4 space-y-3" : "px-3.5 py-3",
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => onToggle(lead.id)}
          className="mt-0.5 shrink-0 rounded-lg p-1 text-white/50 hover:bg-white/10 hover:text-white transition-colors"
          aria-expanded={expanded}
          aria-label={expanded ? `Collapse ${lead.company}` : `Expand ${lead.company}`}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        <button
          type="button"
          onClick={() => onToggle(lead.id)}
          className="min-w-0 flex-1 text-left"
        >
          <h4 className="text-sm font-bold text-white leading-snug truncate">
            {lead.company}
          </h4>
          {!expanded ? (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-white/60">
              {lead.expectedRevenue ? (
                <span className="font-bold tabular-nums text-emerald-400">
                  {formatINRWhole(lead.expectedRevenue)}
                </span>
              ) : null}
              {lead.probability != null ? (
                <span className="text-white/40">{lead.probability}%</span>
              ) : null}
              {lead.contactPerson ? (
                <span className="truncate text-white/50">· {lead.contactPerson}</span>
              ) : null}
            </div>
          ) : lead.contactPerson ? (
            <p className="text-xs text-white/60 mt-0.5">{lead.contactPerson}</p>
          ) : null}
        </button>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onEdit(lead)}
            className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white transition-colors"
            aria-label={`Edit ${lead.company}`}
          >
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onRemove(lead.id)}
            className="rounded-lg p-1.5 text-white/50 hover:bg-rose-500/10 hover:text-rose-400 transition-colors"
            aria-label={`Remove ${lead.company}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="space-y-3 pt-2 border-t border-white/5 text-xs text-white/70">
          {lead.phone ? (
            <p className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 text-white/40 shrink-0" />
              <a
                href={`tel:${lead.phone}`}
                className="font-mono text-orange-400 hover:underline"
              >
                {lead.phone}
              </a>
            </p>
          ) : null}

          {memberName ? (
            <p className="flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-white/40 shrink-0" />
              <span>Assigned: {memberName}</span>
            </p>
          ) : null}

          {hasStats ? (
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-white/[0.03] p-2.5">
              {lead.expectedRevenue != null ? (
                <div>
                  <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Value</p>
                  <p className="text-sm font-bold text-white font-mono mt-0.5">
                    {formatINRWhole(lead.expectedRevenue)}
                  </p>
                </div>
              ) : null}
              {lead.probability != null ? (
                <div>
                  <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Probability</p>
                  <p className="text-sm font-bold text-emerald-400 font-mono mt-0.5">
                    {lead.probability}%
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {lead.notes ? (
            <p className="text-xs text-white/50 leading-relaxed bg-white/[0.02] p-2 rounded-xl border border-white/5">
              {lead.notes}
            </p>
          ) : null}

          {lead.expectedClosingDate ? (
            <p className="flex items-center gap-1.5 text-[11px] text-white/40">
              <Calendar className="h-3 w-3" /> Closing: {lead.expectedClosingDate}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Movement Buttons */}
      {lead.status === "lost" ? (
        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={() => onReopen(lead.id)}
            className="flex items-center gap-1.5 text-xs font-semibold text-orange-400 hover:text-orange-300 transition-colors cursor-pointer"
          >
            <Undo2 className="h-3.5 w-3.5" /> Reopen Deal
          </button>
        </div>
      ) : (
        <div className="pt-2 flex items-center justify-between border-t border-white/5 mt-2">
          <button
            type="button"
            disabled={currentIndex === 0}
            onClick={(e) => {
              e.stopPropagation();
              onMove(lead, "left");
            }}
            className="flex items-center gap-1 text-[11px] font-semibold text-white/50 hover:text-white disabled:opacity-20 disabled:hover:text-white/50 transition-colors cursor-pointer active:scale-95 px-2 py-1 rounded-lg hover:bg-white/5"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Prev
          </button>
          <button
            type="button"
            disabled={currentIndex === LEAD_STATUSES.length - 1}
            onClick={(e) => {
              e.stopPropagation();
              onMove(lead, "right");
            }}
            className="flex items-center gap-1 text-[11px] font-semibold text-[#ff6b2b] hover:text-[#ff8a50] disabled:opacity-20 disabled:hover:text-[#ff6b2b] transition-colors cursor-pointer active:scale-95 px-2 py-1 rounded-lg hover:bg-white/5"
          >
            Next <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
});

export function CRMKanbanBoard({
  leads,
  onEdit,
  onRemove,
  onMoveStatus,
  onReopen,
}: {
  leads: Lead[];
  onEdit: (lead: Lead) => void;
  onRemove: (id: string) => void;
  onMoveStatus: (id: string, nextStatus: LeadStatus) => void;
  onReopen: (id: string) => void;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const members = DEFAULT_COMPANY.companyMembers ?? [];
  const memberNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) {
      map.set(m.id, m.name);
    }
    return map;
  }, [members]);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleMove = useCallback(
    (lead: Lead, direction: "left" | "right") => {
      if (lead.status === "lost") return;
      const currentIndex = LEAD_STATUSES.indexOf(lead.status);
      if (direction === "left" && currentIndex > 0) {
        onMoveStatus(lead.id, LEAD_STATUSES[currentIndex - 1]);
      } else if (direction === "right" && currentIndex < LEAD_STATUSES.length - 1) {
        onMoveStatus(lead.id, LEAD_STATUSES[currentIndex + 1]);
      }
    },
    [onMoveStatus],
  );

  // Group leads once in O(N) pass
  const leadsByStatus = useMemo(() => {
    const map: Record<LeadStatus, { items: Lead[]; totalValue: number }> = {
      new_lead: { items: [], totalValue: 0 },
      contacted: { items: [], totalValue: 0 },
      meeting_scheduled: { items: [], totalValue: 0 },
      proposal_sent: { items: [], totalValue: 0 },
      negotiation: { items: [], totalValue: 0 },
      won: { items: [], totalValue: 0 },
      lost: { items: [], totalValue: 0 },
    };
    for (const lead of leads) {
      const group = map[lead.status];
      if (group) {
        group.items.push(lead);
        group.totalValue += lead.expectedRevenue || 0;
      }
    }
    return map;
  }, [leads]);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 pt-1 select-none scrollbar-thin">
      {LEAD_STATUSES.map((status) => {
        const { items: columnLeads, totalValue: colValue } = leadsByStatus[status] ?? {
          items: [],
          totalValue: 0,
        };
        const colCount = columnLeads.length;

        const colTones: Record<
          LeadStatus,
          { border: string; bg: string; text: string; dot: string; glow: string }
        > = {
          new_lead: {
            border: "border-slate-500/20",
            bg: "bg-slate-500/5",
            text: "text-slate-300",
            dot: "bg-slate-400",
            glow: "shadow-slate-500/10",
          },
          contacted: {
            border: "border-blue-500/20",
            bg: "bg-blue-500/5",
            text: "text-blue-300",
            dot: "bg-blue-400 shadow-sm shadow-blue-400",
            glow: "shadow-blue-500/10",
          },
          meeting_scheduled: {
            border: "border-indigo-500/20",
            bg: "bg-indigo-500/5",
            text: "text-indigo-300",
            dot: "bg-indigo-400 shadow-sm shadow-indigo-400",
            glow: "shadow-indigo-500/10",
          },
          proposal_sent: {
            border: "border-amber-500/20",
            bg: "bg-amber-500/5",
            text: "text-amber-300",
            dot: "bg-amber-400 shadow-sm shadow-amber-400",
            glow: "shadow-amber-500/10",
          },
          negotiation: {
            border: "border-purple-500/20",
            bg: "bg-purple-500/5",
            text: "text-purple-300",
            dot: "bg-purple-400 shadow-sm shadow-purple-400",
            glow: "shadow-purple-500/10",
          },
          won: {
            border: "border-emerald-500/30",
            bg: "bg-emerald-500/10",
            text: "text-emerald-300",
            dot: "bg-emerald-400 shadow-sm shadow-emerald-400",
            glow: "shadow-emerald-500/15",
          },
          lost: {
            border: "border-rose-500/20",
            bg: "bg-rose-500/5",
            text: "text-rose-300",
            dot: "bg-rose-400",
            glow: "shadow-rose-500/10",
          },
        };

        const tone = colTones[status];

        return (
          <div
            key={status}
            className={`flex w-72 shrink-0 flex-col rounded-3xl border ${tone.border} ${tone.bg} p-3.5 min-h-[520px] backdrop-blur-xl shadow-xl`}
          >
            <div className="mb-3.5 space-y-1.5 px-1">
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${tone.text}`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} />
                  {leadStatusLabel(status)}
                </span>
                <span className="rounded-full bg-white/10 border border-white/10 px-2 py-0.5 text-[10px] font-black text-white tabular-nums">
                  {colCount}
                </span>
              </div>
              {colValue > 0 ? (
                <p className="text-xs font-semibold text-white/50 tabular-nums">
                  Value: <span className="text-white font-bold">{formatINRWhole(colValue)}</span>
                </p>
              ) : null}
            </div>

            <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[620px] pr-0.5 scrollbar-thin">
              {columnLeads.length === 0 ? (
                <div className="flex h-28 items-center justify-center rounded-2xl border border-dashed border-white/10 text-center text-xs text-white/30 italic">
                  Drop deals here
                </div>
              ) : (
                columnLeads.map((lead) => (
                  <DealCard
                    key={lead.id}
                    lead={lead}
                    expanded={expandedIds.has(lead.id)}
                    onToggle={toggleExpanded}
                    onEdit={onEdit}
                    onRemove={onRemove}
                    onMove={handleMove}
                    onReopen={onReopen}
                    memberName={lead.assignedSalesperson ? memberNameMap.get(lead.assignedSalesperson) ?? "" : ""}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
