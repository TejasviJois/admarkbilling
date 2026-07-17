import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { SearchWithPeriodFilter } from "@/components/operations/SearchWithPeriodFilter";
import { ProjectFormDialog } from "@/components/operations/ProjectFormDialog";
import { DataTable, RowEdit } from "@/components/operations/operations-ui";
import { formatINRWhole } from "@/lib/invoice-calc";
import { matchesAnyDateInPeriod, DEFAULT_PERIOD, type PeriodKey, projectRelevantDates } from "@/lib/date-range-filter";
import { projectBillingRows, recurringStatusLabel } from "@/lib/project-billing";
import { resolveProjectClient } from "@/lib/project-clients";
import type { OperationsData, Project } from "@/lib/types";

export function BillingDetailsLedger({
  ops,
  persist,
}: {
  ops: OperationsData;
  persist: (next: OperationsData) => void;
}) {
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<PeriodKey>(DEFAULT_PERIOD);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);

  const rows = useMemo(() => projectBillingRows(ops.projects), [ops.projects]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!matchesAnyDateInPeriod(projectRelevantDates(r.project), period)) return false;
      if (!q) return true;
      return (
        r.client.toLowerCase().includes(q) ||
        r.billingLabel.toLowerCase().includes(q) ||
        r.project.projectType?.toLowerCase().includes(q) ||
        recurringStatusLabel(r.recurringStatus).toLowerCase().includes(q)
      );
    });
  }, [rows, search, period]);

  const openEdit = (project: Project) => {
    setEditing(project);
    setEditOpen(true);
  };

  const handleSave = (saved: Project) => {
    const prior = ops.projects.find((p) => p.id === saved.id);
    const merged: Project = {
      ...saved,
      payments: prior?.payments ?? saved.payments,
      paymentProofs: prior?.paymentProofs ?? saved.paymentProofs,
      paymentStatus: prior?.paymentStatus ?? saved.paymentStatus,
      historicalReceived: prior?.historicalReceived ?? saved.historicalReceived,
    };
    const { project, clients } = resolveProjectClient(ops, merged);
    persist({
      ...ops,
      projects: ops.projects.map((p) => (p.id === project.id ? project : p)),
      clients,
    });
  };

  return (
    <>
      <SearchWithPeriodFilter
        search={search}
        onSearchChange={setSearch}
        period={period}
        onPeriodChange={setPeriod}
        placeholder="Client, billing, status…"
        className="max-w-xl"
      />

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {search ? "No projects match your search." : "No active projects with billing."}
        </p>
      ) : (
        <DataTable
          headers={[
            "Client",
            "Billing",
            "Upfront",
            "Monthly",
            "Starts",
            "Status",
            "Booked",
            "Received",
            "",
          ]}
          rows={filtered.map((r) => [
            <Link
              key={`client-${r.project.id}`}
              to="/projects"
              className="font-medium text-primary hover:underline"
            >
              {r.client}
            </Link>,
            r.billingLabel,
            r.upfront != null ? formatINRWhole(r.upfront) : "—",
            r.monthly != null ? (
              <span key={`mo-${r.project.id}`}>
                {formatINRWhole(r.monthly)}
                {r.monthlyMonths ? ` × ${r.monthlyMonths}` : "/mo"}
              </span>
            ) : (
              "—"
            ),
            r.monthlyStartDate ?? (r.monthly ? "Not set" : "—"),
            <span
              key={`st-${r.project.id}`}
              className={
                r.recurringStatus === "not_started"
                  ? "text-amber-400"
                  : r.recurringStatus === "active"
                    ? "text-emerald-400"
                    : "text-muted-foreground"
              }
            >
              {recurringStatusLabel(r.recurringStatus)}
            </span>,
            r.bookedRevenue > 0 ? (
              <span key={`book-${r.project.id}`} className="font-medium tabular-nums text-sky-300">
                {formatINRWhole(r.bookedRevenue)}
              </span>
            ) : (
              <span key={`book-${r.project.id}`} className="text-muted-foreground">
                —
              </span>
            ),
            <span key={`rec-${r.project.id}`} className="tabular-nums text-emerald-300">
              {formatINRWhole(r.received)}
            </span>,
            <div key={`edit-${r.project.id}`} className="flex justify-end">
              <RowEdit onClick={() => openEdit(r.project)} />
            </div>,
          ])}
        />
      )}

      <ProjectFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        project={editing}
        onSave={handleSave}
      />
    </>
  );
}
