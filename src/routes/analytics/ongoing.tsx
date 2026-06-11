import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AnalyticsPageHeader,
  AnalyticsSearch,
  AnalyticsSummaryCards,
  AnalyticsTableSection,
} from "@/components/analytics/analytics-ui";
import { ProjectFormDialog } from "@/components/operations/ProjectFormDialog";
import { OperationsLoading, RowEdit } from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";
import type { Project } from "@/lib/types";
import { formatINRWhole } from "@/lib/invoice-calc";
import {
  matchesAnyDateInPeriod,
  DEFAULT_PERIOD,
  type PeriodKey,
  projectRelevantDates,
} from "@/lib/date-range-filter";
import {
  projectBillingRows,
  recurringStatusLabel,
} from "@/lib/project-billing";
import { computeFinancialSummary } from "@/lib/financial";

export const Route = createFileRoute("/analytics/ongoing")({ component: AnalyticsOngoingPage });

function AnalyticsOngoingPage() {
  const { ops, persist, loading } = useOperations();
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<PeriodKey>(DEFAULT_PERIOD);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);

  const openEdit = (project: Project) => {
    setEditing(project);
    setEditOpen(true);
  };

  const handleSave = (saved: Project) => {
    const prior = ops.projects.find((p) => p.id === saved.id);
    const project: Project = {
      ...saved,
      payments: prior?.payments ?? saved.payments,
      paymentProofs: prior?.paymentProofs ?? saved.paymentProofs,
      paymentStatus: prior?.paymentStatus ?? saved.paymentStatus,
    };
    persist({
      ...ops,
      projects: ops.projects.map((p) => (p.id === project.id ? project : p)),
    });
  };

  const rows = useMemo(
    () => projectBillingRows(ops.projects.filter((p) => p.status === "active")),
    [ops.projects],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!matchesAnyDateInPeriod(projectRelevantDates(r.project), period)) return false;
      if (!q) return true;
      return (
        r.client.toLowerCase().includes(q) ||
        r.billingLabel.toLowerCase().includes(q) ||
        r.project.projectType?.toLowerCase().includes(q)
      );
    });
  }, [rows, search, period]);

  const financial = computeFinancialSummary(ops);

  if (loading) return <OperationsLoading />;

  return (
    <div>
      <AnalyticsPageHeader
        title="Ongoing projects"
        description="Active client work with billing structure, booked value, and payments received."
      />
      <AnalyticsSummaryCards
        items={[
          { label: "Ongoing count", value: String(rows.length), tone: "neutral" },
          { label: "Revenue booked", value: formatINRWhole(financial.totalRevenueBooked), tone: "positive" },
        ]}
      />
      <AnalyticsTableSection
        title="Active projects"
        description="Filter by time period or search by client, billing, or type."
        search={
          <AnalyticsSearch
            value={search}
            onChange={setSearch}
            period={period}
            onPeriodChange={setPeriod}
            placeholder="Search ongoing projects…"
          />
        }
        headers={["Client", "Type", "Billing", "Monthly status", "Booked", "Received", ""]}
        rows={filtered.map((r) => [
          <Link
            key={`c-${r.project.id}`}
            to="/projects"
            className="font-medium text-primary hover:underline"
          >
            {r.client}
          </Link>,
          r.project.projectType || "—",
          r.billingLabel,
          recurringStatusLabel(r.recurringStatus),
          r.bookedRevenue > 0 ? formatINRWhole(r.bookedRevenue) : "—",
          r.received > 0 ? (
            <span key={`r-${r.project.id}`} className="tabular-nums text-emerald-300">
              {formatINRWhole(r.received)}
            </span>
          ) : (
            "—"
          ),
          <div key={`edit-${r.project.id}`} className="flex justify-end">
            <RowEdit onClick={() => openEdit(r.project)} />
          </div>,
        ])}
        emptyMessage={search ? "No ongoing projects match your search." : "No ongoing projects."}
      />

      <ProjectFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        project={editing}
        onSave={handleSave}
      />
    </div>
  );
}
