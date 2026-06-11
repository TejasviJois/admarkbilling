import { syncPaymentStatusFromPayments } from "./project-payments";
import type { ExpenseProof, OperationsData } from "./types";

export function attachProjectPaymentProof(
  ops: OperationsData,
  projectId: string,
  paymentId: string,
  proof: Omit<ExpenseProof, "uploadedAt"> & { uploadedAt?: string },
): OperationsData {
  const uploadedAt = proof.uploadedAt ?? new Date().toISOString();
  return {
    ...ops,
    projects: ops.projects.map((project) => {
      if (project.id !== projectId) return project;
      const updated = {
        ...project,
        payments: (project.payments ?? []).map((payment) =>
          payment.id === paymentId
            ? {
                ...payment,
                proof: {
                  imageDataUrl: proof.imageDataUrl,
                  fileName: proof.fileName,
                  mimeType: proof.mimeType,
                  uploadedAt,
                },
              }
            : payment,
        ),
      };
      return syncPaymentStatusFromPayments(updated);
    }),
  };
}

export function attachExpenseProof(
  ops: OperationsData,
  expenseId: string,
  proof: Omit<ExpenseProof, "uploadedAt"> & { uploadedAt?: string },
): OperationsData {
  const uploadedAt = proof.uploadedAt ?? new Date().toISOString();
  return {
    ...ops,
    expenses: ops.expenses.map((expense) =>
      expense.id === expenseId
        ? {
            ...expense,
            proof: {
              imageDataUrl: proof.imageDataUrl,
              fileName: proof.fileName,
              mimeType: proof.mimeType,
              uploadedAt,
            },
          }
        : expense,
    ),
  };
}
