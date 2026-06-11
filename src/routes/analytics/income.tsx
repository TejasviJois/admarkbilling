import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Eye } from "lucide-react";
import {
  AnalyticsPageHeader,
  AnalyticsSearch,
  AnalyticsSummaryCards,
  AnalyticsTableSection,
} from "@/components/analytics/analytics-ui";
import {
  ProofImageDialog,
  ProofImageDialogCloseButton,
} from "@/components/operations/ProofImageDialog";
import { OperationsLoading } from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";
import { flattenProjectIncome, sumAllProjectIncome } from "@/lib/analytics";
import { formatINRWhole } from "@/lib/invoice-calc";

export const Route = createFileRoute("/analytics/income")({ component: AnalyticsIncomePage });

function AnalyticsIncomePage() {
  const { ops, loading } = useOperations();
  const [search, setSearch] = useState("");
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const [viewerTitle, setViewerTitle] = useState("Payment proof");

  const rows = useMemo(() => flattenProjectIncome(ops.projects), [ops.projects]);
  const total = sumAllProjectIncome(ops.projects);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.client.toLowerCase().includes(q) ||
        r.note?.toLowerCase().includes(q) ||
        r.date.includes(q) ||
        String(r.amount).includes(q),
    );
  }, [rows, search]);

  const openProof = (client: string, amount: number, src: string) => {
    setViewerTitle(`${client} — ${formatINRWhole(amount)}`);
    setViewerSrc(src);
    setViewerOpen(true);
  };

  if (loading) return <OperationsLoading />;

  return (
    <div>
      <AnalyticsPageHeader
        title="Total income"
        description="All project payments received — click View proof to see the uploaded screenshot."
      />
      <AnalyticsSummaryCards
        items={[
          { label: "Total received", value: formatINRWhole(total), tone: "positive" },
          { label: "Payment entries", value: String(rows.length), tone: "neutral" },
          {
            label: "With proof",
            value: String(rows.filter((r) => r.hasProof).length),
            tone: "neutral",
          },
        ]}
      />
      <AnalyticsTableSection
        title="Income ledger"
        description="Each row is one payment installment from a project."
        search={
          <AnalyticsSearch
            value={search}
            onChange={setSearch}
            placeholder="Search client, date, amount, note…"
          />
        }
        headers={["Client", "Date", "Amount", "Proof", "Note"]}
        rows={filtered.map((r) => [
          <Link
            key={`client-${r.id}`}
            to="/projects"
            className="font-medium text-primary hover:underline"
          >
            {r.client}
          </Link>,
          r.date,
          <span key={`amt-${r.id}`} className="font-medium tabular-nums text-emerald-300">
            {formatINRWhole(r.amount)}
          </span>,
          r.proofImageUrl ? (
            <button
              key={`proof-${r.id}`}
              type="button"
              onClick={() => openProof(r.client, r.amount, r.proofImageUrl!)}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <Eye className="h-3.5 w-3.5" />
              View proof
            </button>
          ) : (
            <span key={`proof-${r.id}`} className="text-xs text-amber-400/90">
              Missing
            </span>
          ),
          r.note || "—",
        ])}
        emptyMessage={search ? "No payments match your search." : "No payments recorded yet."}
      />

      <ProofImageDialog
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        src={viewerSrc}
        title={viewerTitle}
        description="Uploaded payment screenshot for this installment."
        footer={<ProofImageDialogCloseButton onClose={() => setViewerOpen(false)} />}
      />
    </div>
  );
}
