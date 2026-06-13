import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { DocumentsBreadcrumb, EntityListCard } from "@/components/documents/documents-ui";
import { proofCountLabel } from "@/components/documents/proof-ui";
import { SearchWithPeriodFilter } from "@/components/operations/SearchWithPeriodFilter";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";
import { DEFAULT_PERIOD, type PeriodKey } from "@/lib/date-range-filter";
import { summarizeVendors, vendorMatchesPeriod } from "@/lib/document-ledger";
import { formatINRWhole } from "@/lib/invoice-calc";

export const Route = createFileRoute("/documents/payments/vendors/")({ component: DocumentsVendorsPage });

function DocumentsVendorsPage() {
  const { ops, loading } = useOperations();
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<PeriodKey>(DEFAULT_PERIOD);

  const vendors = useMemo(() => summarizeVendors(ops), [ops]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vendors.filter((v) => {
      if (!vendorMatchesPeriod(ops, v.label, period)) return false;
      if (!q) return true;
      return v.label.toLowerCase().includes(q);
    });
  }, [vendors, ops, search, period]);

  if (loading) return <OperationsLoading />;

  return (
    <div>
      <DocumentsBreadcrumb
        items={[
          { label: "Documents", to: "/documents" },
          { label: "Payments", to: "/documents/payments" },
          { label: "Vendors" },
        ]}
      />
      <OperationsPageHeader
        title="Vendors"
        description="External payouts logged without a partnership link — grouped by vendor name on the expense."
      />

      <SearchWithPeriodFilter
        search={search}
        onSearchChange={setSearch}
        period={period}
        onPeriodChange={setPeriod}
        placeholder="Search vendors…"
        className="mb-4 max-w-xl"
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {search || period !== DEFAULT_PERIOD ? "No vendors match your filters." : "No vendor payouts logged yet."}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((v) => (
            <EntityListCard
              key={v.vendorKey}
              to="/documents/payments/vendors/$vendorKey"
              params={{ vendorKey: v.vendorKey }}
              title={v.label}
              subtitle={`${v.paymentCount} payout${v.paymentCount === 1 ? "" : "s"}`}
              amount={formatINRWhole(v.totalPaid)}
              meta={v.lastPaymentDate ? `Last payout ${v.lastPaymentDate}` : undefined}
              proofHint={proofCountLabel(v.proofCount, v.paymentCount)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
