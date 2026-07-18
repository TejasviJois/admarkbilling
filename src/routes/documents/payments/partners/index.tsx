import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { DocumentsBreadcrumb, EntityListCard } from "@/components/documents/documents-ui";
import { proofCountLabel } from "@/components/documents/proof-ui";
import { SearchWithPeriodFilter } from "@/components/operations/SearchWithPeriodFilter";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";
import { DEFAULT_PERIOD, type PeriodKey } from "@/lib/date-range-filter";
import { summarizePartners, partnerMatchesPeriod } from "@/lib/document-ledger";
import { formatINRWhole } from "@/lib/invoice-calc";

export const Route = createFileRoute("/documents/payments/partners/")({
  component: DocumentsPartnersPage,
});

function DocumentsPartnersPage() {
  const { ops, loading } = useOperations();
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<PeriodKey>(DEFAULT_PERIOD);

  const partners = useMemo(() => summarizePartners(ops), [ops]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return partners.filter((p) => {
      if (!partnerMatchesPeriod(ops, p.partnershipId, period)) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q);
    });
  }, [partners, ops, search, period]);

  if (loading) return <OperationsLoading />;

  return (
    <div>
      <DocumentsBreadcrumb
        items={[
          { label: "Documents", to: "/documents" },
          { label: "Payments", to: "/documents/payments" },
          { label: "Partners" },
        ]}
      />
      <OperationsPageHeader
        title="Partners"
        description="Partnership records with linked external payouts — open one for their full payout history and proofs."
      />

      <SearchWithPeriodFilter
        search={search}
        onSearchChange={setSearch}
        period={period}
        onPeriodChange={setPeriod}
        placeholder="Search partners…"
        className="mb-4 max-w-xl"
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {search || period !== DEFAULT_PERIOD
            ? "No partners match your filters."
            : "No partners on file yet."}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <EntityListCard
              key={p.partnershipId}
              to="/documents/payments/partners/$partnershipId"
              params={{ partnershipId: p.partnershipId }}
              title={p.name}
              subtitle={
                p.paymentCount > 0
                  ? `${p.paymentCount} payout${p.paymentCount === 1 ? "" : "s"}`
                  : "No payouts linked yet"
              }
              amount={p.paymentCount > 0 ? formatINRWhole(p.totalPaid) : undefined}
              meta={
                p.lastPaymentDate
                  ? `Last payout ${p.lastPaymentDate}`
                  : p.status
                    ? `Status: ${p.status}`
                    : undefined
              }
              proofHint={
                p.paymentCount > 0 ? proofCountLabel(p.proofCount, p.paymentCount) : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
