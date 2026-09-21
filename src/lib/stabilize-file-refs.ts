import { toStableAdmarkFileRef } from "@/lib/admark-file-ref";
import type { DocumentsData, OperationsData } from "@/lib/types";

/**
 * Strip expiring signed tokens before writing browser mirrors.
 * Keeps mutation diffs honest and lets the UI re-sign on demand.
 */
export function stabilizeOperationsFileRefs(data: OperationsData): OperationsData {
  return {
    ...data,
    payments: (data.payments ?? []).map((payment) => ({
      ...payment,
      screenshotDataUrl: toStableAdmarkFileRef(payment.screenshotDataUrl) ?? payment.screenshotDataUrl,
    })),
    transactions: (data.transactions ?? []).map((tx) => ({
      ...tx,
      attachmentDataUrl: toStableAdmarkFileRef(tx.attachmentDataUrl) ?? tx.attachmentDataUrl,
    })),
    expenses: (data.expenses ?? []).map((expense) => ({
      ...expense,
      proof: expense.proof
        ? {
            ...expense.proof,
            imageDataUrl:
              toStableAdmarkFileRef(expense.proof.imageDataUrl) ?? expense.proof.imageDataUrl,
          }
        : expense.proof,
    })),
    projects: (data.projects ?? []).map((project) => ({
      ...project,
      payments: project.payments?.map((payment) => ({
        ...payment,
        proof: payment.proof
          ? {
              ...payment.proof,
              imageDataUrl:
                toStableAdmarkFileRef(payment.proof.imageDataUrl) ?? payment.proof.imageDataUrl,
            }
          : payment.proof,
      })),
      paymentProofs: project.paymentProofs?.map((proof) => ({
        ...proof,
        imageDataUrl: toStableAdmarkFileRef(proof.imageDataUrl) ?? proof.imageDataUrl,
      })),
    })),
  };
}

export function stabilizeDocumentsFileRefs(data: DocumentsData): DocumentsData {
  return {
    agreements: (data.agreements ?? []).map((doc) => ({
      ...doc,
      fileDataUrl: toStableAdmarkFileRef(doc.fileDataUrl) ?? doc.fileDataUrl,
    })),
    archiveDocuments: (data.archiveDocuments ?? []).map((doc) => ({
      ...doc,
      fileDataUrl: toStableAdmarkFileRef(doc.fileDataUrl) ?? doc.fileDataUrl,
    })),
  };
}

export function countOperationsRecords(data: OperationsData): number {
  return (
    (data.projects?.length ?? 0) +
    (data.clients?.length ?? 0) +
    (data.payments?.length ?? 0) +
    (data.transactions?.length ?? 0) +
    (data.expenses?.length ?? 0) +
    (data.leads?.length ?? 0) +
    (data.partnerships?.length ?? 0)
  );
}

export function countDocumentsRecords(data: DocumentsData): number {
  return (data.agreements?.length ?? 0) + (data.archiveDocuments?.length ?? 0);
}
