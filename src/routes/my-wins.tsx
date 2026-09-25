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
        <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          No wins yet. Mark Contacted on Lead List or Directory, then record Win with the closed price.
        </div>
      ) : (
        <>
          <div className="space-y-2 md:hidden">
            {commissions.map((commission) => {
              const project = projects.find((item) => item.id === commission.projectId);
              const closedPrice = project?.billing?.contractValue;
              const total = commissionTotal(commission);
              const canRevert = commission.status === "planned";
              return (
                <div
                  key={commission.id}
                  className="rounded-lg border border-border bg-card p-3 shadow-sm"
                >
                  <p className="font-medium text-foreground">
                    {project?.name || project?.client || commission.label || commission.projectId}
                  </p>
                  {project?.client && project.client !== project.name ? (
                    <p className="text-xs text-muted-foreground">{project.client}</p>
                  ) : null}
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <dt className="text-muted-foreground">Closed price</dt>
                      <dd className="tabular-nums text-foreground">
                        {closedPrice != null ? formatINRWhole(closedPrice) : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Commission</dt>
                      <dd className="tabular-nums text-muted-foreground">
                        {total > 0 ? formatINRWhole(total) : "Admin sets"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Status</dt>
                      <dd className="capitalize text-foreground">{commission.status}</dd>
                    </div>
                  </dl>
                  <div className="mt-3">
                    {canRevert ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 text-xs"
                        disabled={revertingId === commission.id}
                        onClick={() => revert(commission)}
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                        {revertingId === commission.id ? "Reverting…" : "Revert"}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">Paid — ask admin</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden overflow-hidden rounded-lg border border-border md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Project</th>
                    <th className="px-4 py-3 font-medium">Closed price</th>
                    <th className="px-4 py-3 font-medium">Commission</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {commissions.map((commission) => {
                    const project = projects.find((item) => item.id === commission.projectId);
                    const closedPrice = project?.billing?.contractValue;
                    const total = commissionTotal(commission);
                    const canRevert = commission.status === "planned";
                    return (
                      <tr key={commission.id}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-foreground">
                            {project?.name ||
                              project?.client ||
                              commission.label ||
                              commission.projectId}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {project?.client && project.client !== project.name
                              ? project.client
                              : null}
                          </p>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-foreground">
                          {closedPrice != null ? formatINRWhole(closedPrice) : "—"}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">
                          {total > 0 ? formatINRWhole(total) : "Admin sets"}
                        </td>
                        <td className="px-4 py-3 capitalize text-muted-foreground">
                          {commission.status}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {canRevert ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1.5 text-xs"
                              disabled={revertingId === commission.id}
                              onClick={() => revert(commission)}
                            >
                              <Undo2 className="h-3.5 w-3.5" />
                              {revertingId === commission.id ? "Reverting…" : "Revert"}
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">Paid — ask admin</span>
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
