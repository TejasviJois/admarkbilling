import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { DocumentsBreadcrumb, EntityListCard } from "@/components/documents/documents-ui";
import { proofCountLabel } from "@/components/documents/proof-ui";
import { SearchWithPeriodFilter } from "@/components/operations/SearchWithPeriodFilter";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";
import { DEFAULT_PERIOD, type PeriodKey } from "@/lib/date-range-filter";
import { summarizeClients, clientMatchesPeriod } from "@/lib/document-ledger";
import { formatINRWhole } from "@/lib/invoice-calc";

export const Route = createFileRoute("/documents/payments/clients/")({ component: DocumentsClientsPage });

function DocumentsClientsPage() {
  const { ops, loading } = useOperations();
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<PeriodKey>(DEFAULT_PERIOD);

  const clients = useMemo(() => summarizeClients(ops), [ops]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      if (!clientMatchesPeriod(ops, c.client, period)) return false;
      if (!q) return true;
      return c.client.toLowerCase().includes(q);
    });
  }, [clients, ops, search, period]);

  if (loading) return <OperationsLoading />;

  return (
    <div>
      <DocumentsBreadcrumb
        items={[
          { label: "Documents", to: "/documents" },
          { label: "Payments", to: "/documents/payments" },
          { label: "Clients" },
        ]}
      />
      <OperationsPageHeader
        title="Clients"
        description="Each client groups all project payments received — open one to see the full history and proofs."
      />

      <SearchWithPeriodFilter
        search={search}
        onSearchChange={setSearch}
        period={period}
        onPeriodChange={setPeriod}
        placeholder="Search clients…"
        className="mb-4 max-w-xl"
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {search || period !== DEFAULT_PERIOD ? "No clients match your filters." : "No clients with payments yet."}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <EntityListCard
              key={c.slug}
              to="/documents/payments/clients/$clientKey"
              params={{ clientKey: c.slug }}
              title={c.client}
              subtitle={`${c.projectCount} project${c.projectCount === 1 ? "" : "s"} · ${c.paymentCount} payment${c.paymentCount === 1 ? "" : "s"}`}
              amount={formatINRWhole(c.totalReceived)}
              meta={c.lastPaymentDate ? `Last payment ${c.lastPaymentDate}` : undefined}
              proofHint={proofCountLabel(c.proofCount, c.paymentCount)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
