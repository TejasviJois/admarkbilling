import { Edit2, Eye, Trash2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  formatProjectStatusCounts,
  type ClientProjectCounts,
} from "@/lib/client-projects";
import type { Client } from "@/lib/types";

type ProjectBadge = "active" | "completed" | "none";

const PROJECT_BADGE_STYLES: Record<ProjectBadge, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-emerald-500/10 text-emerald-500" },
  completed: { label: "Completed", className: "bg-sky-500/10 text-sky-500" },
  none: { label: "No Projects", className: "bg-muted-foreground/10 text-muted-foreground" },
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
    <div className="glass-panel overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
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
                      {projectBadgeById?.has(c.id) && (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border border-white/10 backdrop-blur-md ${PROJECT_BADGE_STYLES[projectBadgeById.get(c.id)!].className}`}
                        >
                          {PROJECT_BADGE_STYLES[projectBadgeById.get(c.id)!].label}
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
                    {c.contactPerson}
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
                        title="View Client Overview"
                        aria-label="View Client Overview"
                      >
                        <Eye className="h-4 w-4" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => onEdit(c)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                        title="Edit Client"
                        aria-label="Edit Client"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemove(c.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-rose-400/70 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        title="Delete Client"
                        aria-label="Delete Client"
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
  );
}
