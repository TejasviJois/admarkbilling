import { useCallback, useMemo, useState } from "react";
import { DataTable } from "@/components/operations/operations-ui";
import { ProofThumbnail, proofFromFile } from "@/components/documents/proof-ui";
import {
  ProofImageDialog,
  ProofImageDialogCloseButton,
} from "@/components/operations/ProofImageDialog";
import { attachExpenseProof, attachProjectPaymentProof } from "@/lib/attach-proof";
import { formatINRWhole } from "@/lib/invoice-calc";
import type { IncomeRow } from "@/lib/analytics";
import type { OutgoingPaymentRow } from "@/lib/document-ledger";
import type { OperationsData } from "@/lib/types";

export function ClientPaymentHistoryTable({
  rows,
  ops,
  persist,
}: {
  rows: IncomeRow[];
  ops: OperationsData;
  persist: (next: OperationsData) => void;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const [viewerTitle, setViewerTitle] = useState("Payment proof");

  const openProof = (client: string, amount: number, src: string) => {
    setViewerTitle(`${client} — ${formatINRWhole(amount)}`);
    setViewerSrc(src);
    setViewerOpen(true);
  };

  const uploadProof = useCallback(
    async (row: IncomeRow, file: File) => {
      const proof = await proofFromFile(file);
      persist(attachProjectPaymentProof(ops, row.projectId, row.id, proof));
    },
    [ops, persist],
  );

  const tableRows = useMemo(
    () =>
      rows.map((r) => [
        r.date,
        <span key={`amt-${r.id}`} className="font-medium tabular-nums text-emerald-400">
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
      ]),
    [rows, uploadProof],
  );

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No payments recorded for this client yet.</p>;
  }

  return (
    <>
      <DataTable headers={["Date", "Amount", "Proof", "Note"]} rows={tableRows} />
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

export function OutgoingPaymentHistoryTable({
  rows,
  ops,
  persist,
  allowUpload = true,
}: {
  rows: OutgoingPaymentRow[];
  ops: OperationsData;
  persist: (next: OperationsData) => void;
  allowUpload?: boolean;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const [viewerTitle, setViewerTitle] = useState("Payment proof");

  const openProof = (label: string, amount: number, src: string) => {
    setViewerTitle(`${label} — ${formatINRWhole(amount)}`);
    setViewerSrc(src);
    setViewerOpen(true);
  };

  const uploadProof = useCallback(
    async (row: OutgoingPaymentRow, file: File) => {
      const proof = await proofFromFile(file);
      persist(attachExpenseProof(ops, row.id, proof));
    },
    [ops, persist],
  );

  const tableRows = useMemo(
    () =>
      rows.map((r) => [
        r.date,
        r.label,
        <span key={`amt-${r.id}`} className="font-medium tabular-nums text-rose-400">
          {formatINRWhole(r.amount)}
        </span>,
        <ProofThumbnail
          key={`proof-${r.id}`}
          imageUrl={r.proofImageUrl}
          label={`${r.label} ${formatINRWhole(r.amount)}`}
          onView={(src) => openProof(r.label, r.amount, src)}
          onUpload={
            allowUpload && !r.proofImageUrl ? (file) => uploadProof(r, file) : undefined
          }
        />,
        r.notes || "—",
      ]),
    [rows, allowUpload, uploadProof],
  );

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No payout history yet.</p>;
  }

  return (
    <>
      <DataTable headers={["Date", "Label", "Amount", "Proof", "Notes"]} rows={tableRows} />
      <ProofImageDialog
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        src={viewerSrc}
        title={viewerTitle}
        description="Uploaded payout proof."
        footer={<ProofImageDialogCloseButton onClose={() => setViewerOpen(false)} />}
      />
    </>
  );
}
