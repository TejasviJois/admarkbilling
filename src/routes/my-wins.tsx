import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  OperationsLoading,
  OperationsPageHeader,
} from "@/components/operations/operations-ui";
import { formatINRWhole } from "@/lib/invoice-calc";
import { logClientError } from "@/lib/client-logger";
import { getAuthStatusCached } from "@/lib/auth-status-cache";
import { commissionTotal } from "@/lib/ops-costs";
import type { Project, ProjectCommission } from "@/lib/types";
import { listMyCommissionsFn, revertSalesWinFn } from "@/server/sales-win-fns";

export const Route = createFileRoute("/my-wins")({ component: MyWinsRoute });

function MyWinsRoute() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    void getAuthStatusCached()
      .then((status) => setAllowed(status.role === "sales"))
      .catch(() => setAllowed(false));
  }, []);
  if (allowed === null) return <OperationsLoading />;
  if (!allowed) {
    return (
      <div className="rounded-lg border border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
        My wins is for sales logins.
      </div>
    );
  }
  return <MyWinsPage />;
}

function MyWinsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [commissions, setCommissions] = useState<ProjectCommission[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [revertingId, setRevertingId] = useState<string | null>(null);

  const reload = () => {
    setLoading(true);
    void listMyCommissionsFn()
      .then((result) => {
        setCommissions(result.commissions);
        setProjects(result.projects);
      })
      .catch((error) => {
        logClientError("sales.myWins", error);
        toast.error(error instanceof Error ? error.message : "Could not load wins.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
  }, []);

  const revert = (commission: ProjectCommission) => {
    if (
      !confirm(
        "Revert this win? The project is removed and the lead/contact goes back to Contacted.",
      )
    ) {
      return;
    }
    setRevertingId(commission.id);
    void revertSalesWinFn({ data: { commissionId: commission.id } })
      .then(() => {
        toast.success("Win reverted — back on Contacted.");
        reload();
        void navigate({ to: "/contacted" });
      })
      .catch((error) => {
        logClientError("sales.revertWin", error);
        toast.error(error instanceof Error ? error.message : "Could not revert win.");
      })
      .finally(() => setRevertingId(null));
  };

  if (loading) return <OperationsLoading />;

  return (
    <div className="space-y-6">
      <OperationsPageHeader
        title="My wins"
        description="Closed deals you recorded. Admin sets commission in Office & Ops. You can revert a win back to Contacted."
      />

      {commissions.length === 0 ? (
        <div className="glass-panel rounded-2xl border border-dashed border-white/10 py-16 text-center text-sm text-white/40">
          No wins yet. Mark Contacted on Lead List or Directory, then record Win with the closed price.
        </div>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {commissions.map((commission) => {
              const project = projects.find((item) => item.id === commission.projectId);
              const closedPrice = project?.billing?.contractValue;
              const total = commissionTotal(commission);
              const canRevert = commission.status === "planned";
              return (
                <div
                  key={commission.id}
                  className="glass-panel rounded-2xl border border-white/10 p-4 transition-all hover:border-white/20"
                >
                  <p className="font-semibold text-white">
                    {project?.name || project?.client || commission.label || commission.projectId}
                  </p>
                  {project?.client && project.client !== project.name ? (
                    <p className="text-xs text-white/50">{project.client}</p>
                  ) : null}
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs pt-2 border-t border-white/10">
                    <div>
                      <dt className="text-white/40">Closed price</dt>
                      <dd className="tabular-nums font-mono font-semibold text-emerald-400">
                        {closedPrice != null ? formatINRWhole(closedPrice) : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-white/40">Commission</dt>
                      <dd className="tabular-nums font-mono text-white/70">
                        {total > 0 ? formatINRWhole(total) : "Admin sets"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-white/40">Status</dt>
                      <dd className="capitalize font-medium text-white/80">{commission.status}</dd>
                    </div>
                  </dl>
                  <div className="mt-3.5 pt-2 border-t border-white/10">
                    {canRevert ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 text-xs rounded-xl border-white/10 bg-white/[0.04] text-white/70 hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-rose-400"
                        disabled={revertingId === commission.id}
                        onClick={() => revert(commission)}
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                        {revertingId === commission.id ? "Reverting…" : "Revert"}
                      </Button>
                    ) : (
                      <span className="text-xs text-emerald-400 font-medium">Paid — ask admin</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden overflow-hidden rounded-2xl border border-white/10 glass-panel md:block shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.02] text-xs font-semibold uppercase tracking-wider text-white/40">
                    <th className="px-4 py-3.5">Project</th>
                    <th className="px-4 py-3.5">Closed price</th>
                    <th className="px-4 py-3.5">Commission</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {commissions.map((commission) => {
                    const project = projects.find((item) => item.id === commission.projectId);
                    const closedPrice = project?.billing?.contractValue;
                    const total = commissionTotal(commission);
                    const canRevert = commission.status === "planned";
                    return (
                      <tr key={commission.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3 align-middle">
                          <p className="font-semibold text-white">
                            {project?.name ||
                              project?.client ||
                              commission.label ||
                              commission.projectId}
                          </p>
                          <p className="text-xs text-white/50">
                            {project?.client && project.client !== project.name
                              ? project.client
                              : null}
                          </p>
                        </td>
                        <td className="px-4 py-3 align-middle tabular-nums font-mono font-semibold text-emerald-400">
                          {closedPrice != null ? formatINRWhole(closedPrice) : "—"}
                        </td>
                        <td className="px-4 py-3 align-middle tabular-nums font-mono text-white/70">
                          {total > 0 ? formatINRWhole(total) : "Admin sets"}
                        </td>
                        <td className="px-4 py-3 align-middle capitalize text-xs">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-semibold border ${
                            commission.status === "paid" 
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          }`}>
                            {commission.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-middle text-right">
                          {canRevert ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1.5 text-xs rounded-xl border-white/10 bg-white/[0.04] text-white/70 hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-rose-400"
                              disabled={revertingId === commission.id}
                              onClick={() => revert(commission)}
                            >
                              <Undo2 className="h-3.5 w-3.5" />
                              {revertingId === commission.id ? "Reverting…" : "Revert"}
                            </Button>
                          ) : (
                            <span className="text-xs font-semibold text-emerald-400">Paid</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
