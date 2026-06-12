import { useCallback, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { TrendingUp } from "lucide-react";
import { ProofThumbnail, proofFromFile } from "@/components/documents/proof-ui";
import {
  ProofImageDialog,
  ProofImageDialogCloseButton,
} from "@/components/operations/ProofImageDialog";
import { SearchWithPeriodFilter } from "@/components/operations/SearchWithPeriodFilter";
import { flattenProjectIncome, sumAllProjectIncome, type IncomeRow } from "@/lib/analytics";
import { attachProjectPaymentProof } from "@/lib/attach-proof";
import { isWithinPeriod, DEFAULT_PERIOD, type PeriodKey } from "@/lib/date-range-filter";
import { formatINRWhole } from "@/lib/invoice-calc";
import type { OperationsData } from "@/lib/types";
import { DataSection, DataTable, EmptyRow } from "./operations-ui";

export function IncomeSection({
  ops,
  persist,
  open,
  onOpenChange,
}: {
  ops: OperationsData;
  persist: (next: OperationsData) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<PeriodKey>(DEFAULT_PERIOD);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const [viewerTitle, setViewerTitle] = useState("Payment proof");

  const rows = useMemo(() => flattenProjectIncome(ops.projects), [ops.projects]);
  const total = sumAllProjectIncome(ops.projects);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!isWithinPeriod(r.date, period)) return false;
      if (!q) return true;
      return (
        r.client.toLowerCase().includes(q) ||
        r.note?.toLowerCase().includes(q) ||
        r.date.includes(q) ||
        String(r.amount).includes(q)
      );
    });
  }, [rows, search, period]);

  const openProof = (client: string, amount: number, src: string) => {
    setViewerTitle(`${client} — ${formatINRWhole(amount)}`);
    setViewerSrc(src);
    setViewerOpen(true);
  };

  const uploadProof = useCallback(
    async (row: IncomeRow, file: File) => {
      const proof = await proofFromFile(file, `proofs/projects/${row.projectId}/payments/${row.id}`);
      persist(attachProjectPaymentProof(ops, row.projectId, row.id, proof));
    },
    [ops, persist],
  );

  return (
    <>
      <DataSection
        id="income"
        collapsible
        defaultOpen={false}
        open={open}
        onOpenChange={onOpenChange}
        title="Income"
        description="Project payments received — log new installments from the Projects page."
        icon={<TrendingUp className="h-5 w-5 text-emerald-400" strokeWidth={2} />}
      >
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">Total received</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-300">
              {formatINRWhole(total)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">Payment entries</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{rows.length}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">With proof</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {rows.filter((r) => r.hasProof).length}
            </p>
          </div>
        </div>

        <div className="mb-6 max-w-xl">
          <SearchWithPeriodFilter
            id="income-search"
            search={search}
            onSearchChange={setSearch}
            period={period}
            onPeriodChange={setPeriod}
            placeholder="Client, date, amount, note…"
          />
        </div>

        {rows.length === 0 ? (
          <EmptyRow message="No payments recorded yet. Add payments from Projects." />
        ) : filtered.length === 0 ? (
          <EmptyRow message="No payments match your search." />
        ) : (
          <DataTable
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
              <ProofThumbnail
                key={`proof-${r.id}`}
                imageUrl={r.proofImageUrl}
                label={`${r.client} ${formatINRWhole(r.amount)}`}
                onView={(src) => openProof(r.client, r.amount, src)}
                onUpload={r.proofImageUrl ? undefined : (file) => uploadProof(r, file)}
              />,
              r.note || "—",
            ])}
          />
        )}
      </DataSection>

      <ProofImageDialog
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        src={viewerSrc}
        title={viewerTitle}
        description="Uploaded payment screenshot for this installment."
        footer={<ProofImageDialogCloseButton onClose={() => setViewerOpen(false)} />}
      />
    </>
  );
}
