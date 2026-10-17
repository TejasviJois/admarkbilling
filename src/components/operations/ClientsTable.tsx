import { Edit2, Eye, Phone, Mail, Trash2, User } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  formatProjectStatusCounts,
  type ClientProjectCounts,
} from "@/lib/client-projects";
import type { Client } from "@/lib/types";

type ProjectBadge = "active" | "completed" | "none";

const PROJECT_BADGE_STYLES: Record<ProjectBadge, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  completed: { label: "Completed", className: "bg-sky-500/10 text-sky-400 border-sky-500/20" },
  none: { label: "No Projects", className: "bg-white/5 text-white/40 border-white/10" },
};

export function ClientsTable({
  clients,
  projectBadgeById,
  projectCountsById,
  onEdit,
  onRemove,
  showDetails = false,
  emptyMessage = "No clients configured. Add your first client profile to get started.",
}: {
  clients: Client[];
  /** Per-client project state badge (Active / Completed / No Projects). */
  projectBadgeById?: Map<string, ProjectBadge>;
  /** Ongoing + completed project counts for the relationship. */
  projectCountsById?: Map<string, ClientProjectCounts>;
  onEdit: (client: Client) => void;
  onRemove: (id: string) => void;
  showDetails?: boolean;
  emptyMessage?: string;
}) {
  const colSpan = showDetails ? 7 : 4;

  return (
    <div className="space-y-4">
      {/* Mobile Card Layout (< 640px) */}
      <div className="grid gap-3 sm:hidden">
        {clients.length === 0 ? (
          <div className="glass-panel rounded-2xl border border-white/10 p-8 text-center text-sm text-white/40">
            {emptyMessage}
          </div>
        ) : (
          clients.map((c) => {
            const counts = projectCountsById?.get(c.id);
            const badge = projectBadgeById?.get(c.id);
            return (
              <div
                key={c.id}
                className="glass-card relative overflow-hidden rounded-2xl border border-white/10 p-4 transition-all hover:border-white/20 shadow-lg"
              >
                {/* Header: Company Name & Status Badges */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/clients/$id"
                      params={{ id: c.id }}
                      aria-label={`View ${c.companyName} overview`}
                      className="text-[15px] font-bold text-white hover:text-[#ff6b2b] transition-colors break-words leading-snug"
                    >
                      {c.companyName}
                    </Link>
                    {counts && (counts.active > 0 || counts.completed > 0) ? (
                      <p className="mt-1 text-xs text-white/50">
                        {formatProjectStatusCounts(counts)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${
                        c.status === "active"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : "bg-white/5 text-white/40 border-white/10"
                      }`}
                    >
                      {c.status}
                    </span>
                    {badge && (
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${PROJECT_BADGE_STYLES[badge].className}`}
                      >
                        {PROJECT_BADGE_STYLES[badge].label}
                      </span>
                    )}
                  </div>
                </div>

                {/* Contact person */}
                <div className="mt-2.5 flex items-center gap-1.5 text-xs text-white/70">
                  <User className="h-3.5 w-3.5 shrink-0 text-white/40" />
                  <span className="truncate">{c.contactPerson || "No contact specified"}</span>
                </div>

                {/* Expandable details when toggled */}
                {showDetails && (c.email || c.phone || c.clientSince) && (
                  <div className="mt-2.5 space-y-1.5 rounded-xl border border-white/5 bg-white/[0.02] p-2.5 text-xs text-white/60">
                    {c.email && (
                      <div className="flex items-center gap-2 truncate">
                        <Mail className="h-3 w-3 shrink-0 text-white/40" />
                        <span className="truncate text-white/80">{c.email}</span>
                      </div>
                    )}
                    {c.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-3 w-3 shrink-0 text-white/40" />
                        <span className="text-white/80">{c.phone}</span>
                      </div>
                    )}
                    {c.clientSince && (
                      <div className="text-[11px] text-white/40">
                        Client since: <span className="text-white/60">{c.clientSince}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Footer Actions */}
                <div className="mt-3.5 flex items-center justify-between border-t border-white/5 pt-3">
                  <Link
                    to="/clients/$id"
                    params={{ id: c.id }}
                    aria-label={`View ${c.companyName} overview`}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#ff6b2b] hover:text-[#ff8a50] transition-colors"
                  >
                    <Eye className="h-3.5 w-3.5" /> View Overview
                  </Link>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onEdit(c)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                      title={`Edit ${c.companyName}`}
                      aria-label={`Edit ${c.companyName}`}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(c.id)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 transition-colors"
                      title={`Delete ${c.companyName}`}
                      aria-label={`Delete ${c.companyName}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop Table (>= sm screens) */}
      <div className="hidden sm:block glass-panel overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full table-auto border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.03] text-xs font-semibold uppercase tracking-wider text-white/50">
                <th className="px-5 py-4">Client / Relationship</th>
                <th className="px-5 py-4">Contact Person</th>
                {showDetails ? (
                  <>
                    <th className="px-5 py-4">Email</th>
                    <th className="px-5 py-4">Phone</th>
                    <th className="px-5 py-4">Client Since</th>
                  </>
                ) : null}
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {clients.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="px-5 py-12 text-center text-sm text-white/40">
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                clients.map((c) => {
                  const counts = projectCountsById?.get(c.id);
                  const badge = projectBadgeById?.get(c.id);
                  return (
                    <tr key={c.id} className="hover:bg-white/[0.04] transition-colors">
                      <td className="max-w-[16rem] px-5 py-4 font-semibold text-white break-words">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <Link
                            to="/clients/$id"
                            params={{ id: c.id }}
                            className="hover:underline text-[#ff6b2b] hover:text-[#ff8a50] transition-colors font-bold"
                          >
                            {c.companyName}
                          </Link>
                          {badge && (
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border border-white/10 backdrop-blur-md ${PROJECT_BADGE_STYLES[badge].className}`}
                            >
                              {PROJECT_BADGE_STYLES[badge].label}
                            </span>
                          )}
                        </div>
                        {counts && (counts.active > 0 || counts.completed > 0) ? (
                          <p className="mt-0.5 text-[11px] font-normal text-white/45">
                            {formatProjectStatusCounts(counts)}
                          </p>
                        ) : null}
                      </td>
                      <td className="max-w-[12rem] px-5 py-4 text-white/70 break-words">
                        {c.contactPerson || "—"}
                      </td>
                      {showDetails ? (
                        <>
                          <td className="whitespace-nowrap px-5 py-4 text-white/60">
                            {c.email || "—"}
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-white/60">
                            {c.phone || "—"}
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-white/50 text-xs">
                            {c.clientSince || "—"}
                          </td>
                        </>
                      ) : null}
                      <td className="whitespace-nowrap px-5 py-4">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider border ${
                            c.status === "active"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : "bg-white/5 text-white/40 border-white/10"
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-right">
                        <div className="flex justify-end gap-1.5">
                          <Link
                            to="/clients/$id"
                            params={{ id: c.id }}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                            title={`View ${c.companyName} overview`}
                            aria-label={`View ${c.companyName} overview`}
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          <button
                            type="button"
                            onClick={() => onEdit(c)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                            title={`Edit ${c.companyName}`}
                            aria-label={`Edit ${c.companyName}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemove(c.id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-rose-400/70 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                            title={`Delete ${c.companyName}`}
                            aria-label={`Delete ${c.companyName}`}
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
    </div>
  );
}
