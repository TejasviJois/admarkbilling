import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AnalyticsPageHeader,
  AnalyticsSearch,
  AnalyticsSummaryCards,
  AnalyticsTableSection,
} from "@/components/analytics/analytics-ui";
import { ProjectStatusBadge } from "@/components/operations/ProjectsTable";
import { OperationsLoading } from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";
import { formatINRWhole } from "@/lib/invoice-calc";
import {
  projectBillingRows,
  recurringStatusLabel,
  sumBookedProjectRevenue,
} from "@/lib/project-billing";

export const Route = createFileRoute("/analytics/ongoing")({ component: AnalyticsOngoingPage });

function AnalyticsOngoingPage() {
  const { ops, loading } = useOperations();
  const [search, setSearch] = useState("");

  const rows = useMemo(
    () => projectBillingRows(ops.projects.filter((p) => p.status === "active")),
    [ops.projects],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.client.toLowerCase().includes(q) ||
        r.billingLabel.toLowerCase().includes(q) ||
        r.project.projectType?.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const bookedTotal = sumBookedProjectRevenue(ops.projects.filter((p) => p.status === "active"));

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
          { label: "Revenue booked", value: formatINRWhole(bookedTotal), tone: "positive" },
        ]}
      />
      <AnalyticsTableSection
        title="Active projects"
        search={
          <AnalyticsSearch
            value={search}
            onChange={setSearch}
            placeholder="Search ongoing projects…"
          />
        }
        headers={["Client", "Type", "Billing", "Monthly status", "Booked", "Received"]}
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
        ])}
        emptyMessage={search ? "No ongoing projects match your search." : "No ongoing projects."}
      />
    </div>
  );
}
