import { ArrowLeft, ArrowRight, Calendar, User, Phone, Edit2, Trash2, Undo2 } from "lucide-react";
import { LEAD_STATUSES, leadStatusLabel } from "@/lib/lead-utils";
import { formatINRWhole } from "@/lib/invoice-calc";
import { DEFAULT_COMPANY } from "@/lib/constants";
import type { Lead, LeadStatus } from "@/lib/types";

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
  const members = DEFAULT_COMPANY.companyMembers ?? [];
  const memberNameOf = (id?: string) => {
    if (!id) return "";
    return members.find((m) => m.id === id)?.name ?? "";
  };

  const handleMove = (lead: Lead, direction: "left" | "right") => {
    if (lead.status === "lost") return;
    const currentIndex = LEAD_STATUSES.indexOf(lead.status);
    if (direction === "left" && currentIndex > 0) {
      onMoveStatus(lead.id, LEAD_STATUSES[currentIndex - 1]);
    } else if (direction === "right" && currentIndex < LEAD_STATUSES.length - 1) {
      onMoveStatus(lead.id, LEAD_STATUSES[currentIndex + 1]);
    }
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 pt-1 select-none scrollbar-thin">
      {LEAD_STATUSES.map((status) => {
        const columnLeads = leads.filter((l) => l.status === status);
        const colValue = columnLeads.reduce((sum, l) => sum + (l.expectedRevenue || 0), 0);
        const colCount = columnLeads.length;

        // Custom column styling
        const colTones: Record<
          LeadStatus,
          { border: string; bg: string; text: string; dot: string }
        > = {
          new_lead: {
            border: "border-slate-200 dark:border-slate-800",
            bg: "bg-slate-500/5",
            text: "text-slate-700 dark:text-slate-300",
            dot: "bg-slate-400",
          },
          contacted: {
            border: "border-blue-200 dark:border-blue-800/60",
            bg: "bg-blue-500/5",
            text: "text-blue-700 dark:text-blue-300",
            dot: "bg-blue-400",
          },
          meeting_scheduled: {
            border: "border-indigo-200 dark:border-indigo-800/60",
            bg: "bg-indigo-500/5",
            text: "text-indigo-700 dark:text-indigo-300",
            dot: "bg-indigo-400",
          },
          proposal_sent: {
            border: "border-amber-200 dark:border-amber-800/60",
            bg: "bg-amber-500/5",
            text: "text-amber-700 dark:text-amber-300",
            dot: "bg-amber-400",
          },
          negotiation: {
            border: "border-purple-200 dark:border-purple-800/60",
            bg: "bg-purple-500/5",
            text: "text-purple-700 dark:text-purple-300",
            dot: "bg-purple-400",
          },
          won: {
            border: "border-emerald-200 dark:border-emerald-800/60",
            bg: "bg-emerald-500/5",
            text: "text-emerald-700 dark:text-emerald-300",
            dot: "bg-emerald-500",
          },
          lost: {
            border: "border-rose-200 dark:border-rose-800/60",
            bg: "bg-rose-500/5",
            text: "text-rose-700 dark:text-rose-300",
            dot: "bg-rose-500",
          },
        };

        const tone = colTones[status];

        return (
          <div
            key={status}
            className={`flex w-72 shrink-0 flex-col rounded-xl border ${tone.border} ${tone.bg} p-3 min-h-[500px]`}
          >
            {/* Column Header */}
            <div className="mb-3 space-y-1">
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${tone.text}`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} />
                  {leadStatusLabel(status)}
                </span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground tabular-nums">
                  {colCount}
                </span>
              </div>
              {colValue > 0 && (
                <p className="text-[11px] font-semibold text-muted-foreground tabular-nums">
                  Value: {formatINRWhole(colValue)}
                </p>
              )}
            </div>

            {/* Column Deal Cards List */}
            <div className="flex-1 space-y-3 overflow-y-auto max-h-[600px] pr-0.5 scrollbar-none">
              {columnLeads.length === 0 ? (
                <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border/60 text-center text-xs text-muted-foreground italic">
                  Drop deals here
                </div>
              ) : (
                columnLeads.map((lead) => {
                  const hasStats = lead.expectedRevenue != null || lead.probability != null;
                  const currentIndex = LEAD_STATUSES.indexOf(lead.status);

                  return (
                    <div
                      key={lead.id}
                      className="rounded-lg border border-border bg-card p-3.5 shadow-sm transition-all hover:shadow-md hover:border-primary/20 space-y-3"
                    >
                      {/* Company Name / Action block */}
                      <div className="flex items-start justify-between gap-1">
                        <div>
                          <h4 className="text-sm font-bold text-foreground leading-snug">
                            {lead.company}
                          </h4>
                          {lead.contactPerson && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {lead.contactPerson}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => onEdit(lead)}
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label={`Edit ${lead.company}`}
                          >
                            <Edit2 className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemove(lead.id)}
                            className="rounded p-1 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500"
                            aria-label={`Remove ${lead.company} from pipeline`}
                            title="Remove from pipeline (keeps history)"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      {/* Expected Value & Probability Progress */}
                      {hasStats && (
                        <div className="space-y-1.5 border-t border-border/60 pt-2 text-xs">
                          <div className="flex justify-between font-semibold">
                            <span className="text-muted-foreground">Expected:</span>
                            <span className="tabular-nums text-foreground">
                              {lead.expectedRevenue ? formatINRWhole(lead.expectedRevenue) : "—"}
                            </span>
                          </div>
                          {lead.probability != null && (
                            <div className="space-y-1">
                              <div className="flex justify-between text-[10px] text-muted-foreground">
                                <span>Probability:</span>
                                <span className="font-semibold">{lead.probability}%</span>
                              </div>
                              <div className="h-1 w-full rounded bg-muted overflow-hidden">
                                <div
                                  className={`h-full rounded ${
                                    lead.probability > 70
                                      ? "bg-emerald-500"
                                      : lead.probability > 40
                                        ? "bg-amber-500"
                                        : "bg-blue-500"
                                  }`}
                                  style={{ width: `${lead.probability}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Timelines, Reps and Contacts */}
                      <div className="space-y-1 text-[10px] text-muted-foreground border-t border-border/40 pt-2">
                        {lead.expectedClosingDate && (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5 shrink-0" />
                            <span>Close: {lead.expectedClosingDate}</span>
                          </div>
                        )}
                        {lead.assignedSalesperson && (
                          <div className="flex items-center gap-1">
                            <User className="h-3.5 w-3.5 shrink-0" />
                            <span>Rep: {memberNameOf(lead.assignedSalesperson)}</span>
                          </div>
                        )}
                        {lead.phone && (
                          <div className="flex items-center gap-1">
                            <Phone className="h-3.5 w-3.5 shrink-0" />
                            <span>{lead.phone}</span>
                          </div>
                        )}
                      </div>

                      {/* Kanban Move Status Buttons */}
                      {lead.status === "lost" ? (
                        <div className="border-t border-border/40 pt-2">
                          <button
                            type="button"
                            onClick={() => onReopen(lead.id)}
                            className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-muted/60 px-2 py-1.5 text-[11px] font-semibold text-foreground hover:bg-muted"
                          >
                            <Undo2 className="h-3 w-3" /> Reopen
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-between border-t border-border/40 pt-2">
                          <button
                            type="button"
                            disabled={currentIndex === 0}
                            onClick={() => handleMove(lead, "left")}
                            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
                          >
                            <ArrowLeft className="h-3 w-3" /> Prev
                          </button>
                          <button
                            type="button"
                            disabled={currentIndex === LEAD_STATUSES.length - 1}
                            onClick={() => handleMove(lead, "right")}
                            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
                          >
                            Next <ArrowRight className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
