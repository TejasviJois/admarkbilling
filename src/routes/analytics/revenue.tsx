import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AnalyticsPageHeader,
  AnalyticsSearch,
  AnalyticsSummaryCards,
  AnalyticsTableSection,
} from "@/components/analytics/analytics-ui";
import { OperationsLoading } from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";
import {
  projectBillingRows,
  recurringStatusLabel,
  sumActiveMrr,
  sumBookedProjectRevenue,
  sumFutureMonthlyPipeline,
} from "@/lib/project-billing";
import { formatINRWhole } from "@/lib/invoice-calc";

export const Route = createFileRoute("/analytics/revenue")({ component: AnalyticsRevenuePage });

function AnalyticsRevenuePage() {
  const { ops, loading } = useOperations();
  const [search, setSearch] = useState("");

  const rows = useMemo(() => projectBillingRows(ops.projects), [ops.projects]);
  const bookedTotal = sumBookedProjectRevenue(ops.projects);
  const futureMonthly = sumFutureMonthlyPipeline(ops.projects);
  const activeMrr = sumActiveMrr(ops.projects);
  const receivedTotal = rows.reduce((s, r) => s + r.received, 0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.client.toLowerCase().includes(q) ||
        r.billingLabel.toLowerCase().includes(q) ||
        r.project.projectType?.toLowerCase().includes(q) ||
        recurringStatusLabel(r.recurringStatus).toLowerCase().includes(q),
    );
  }, [rows, search]);

  if (loading) return <OperationsLoading />;

  return (
    <div>
      <AnalyticsPageHeader
        title="Project billing"
        description="Upfront payments count in booked revenue immediately. Monthly retainers only count after you set a start date — monthly-only projects like Safe Wheels and Spice Trip stay in 'not started' until then."
      />
      <AnalyticsSummaryCards
        items={[
          { label: "Revenue booked", value: formatINRWhole(bookedTotal), tone: "positive" },
          { label: "Future monthly (not started)", value: formatINRWhole(futureMonthly), tone: "neutral" },
          { label: "Active MRR", value: formatINRWhole(activeMrr), tone: "positive" },
          { label: "Received (logged payments)", value: formatINRWhole(receivedTotal), tone: "neutral" },
        ]}
      />
      <AnalyticsTableSection
        title="Active & planning projects"
        description="Edit billing structure and monthly start dates from the Projects page."
        search={
          <AnalyticsSearch
            value={search}
            onChange={setSearch}
            placeholder="Search client, billing, status…"
          />
        }
        headers={[
          "Client",
          "Billing",
          "Upfront",
          "Monthly",
          "Starts",
          "Status",
          "Booked",
          "Received",
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
        ])}
        emptyMessage={search ? "No projects match your search." : "No active or planning projects."}
      />
    </div>
  );
}
