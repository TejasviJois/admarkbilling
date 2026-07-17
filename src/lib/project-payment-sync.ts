import { syncPaymentStatusFromPayments } from "./project-payments";
import type { Project, ProjectPayment, Transaction } from "./types";

/**
 * Accounts is the only payment-entry surface. Keep the selected project's
 * post-migration payment total synchronized with its authoritative transaction.
 */
export function syncAccountTransactionToProjects(
  projects: Project[],
  saved: Transaction,
): Project[] {
  const withoutPriorLink = projects.map((project) => {
    if (!(project.payments ?? []).some((payment) => payment.id === saved.id)) return project;
    return syncPaymentStatusFromPayments({
      ...project,
      payments: (project.payments ?? []).filter((payment) => payment.id !== saved.id),
    });
  });

  if (saved.type !== "client_payment" || !saved.relatedProjectId) return withoutPriorLink;

  return withoutPriorLink.map((project) => {
    if (project.id !== saved.relatedProjectId) return project;
    const payment: ProjectPayment = {
      id: saved.id,
      amount: saved.amount,
      date: saved.date,
      note: saved.notes || saved.description,
      recordedAfterMigration: true,
      proof: saved.attachmentDataUrl?.startsWith("data:image/")
        ? {
            imageDataUrl: saved.attachmentDataUrl,
            uploadedAt: new Date(saved.updatedAt).toISOString(),
          }
        : undefined,
    };
    return syncPaymentStatusFromPayments({
      ...project,
      payments: [payment, ...(project.payments ?? []).filter((item) => item.id !== saved.id)],
    });
  });
}

export function removeAccountTransactionFromProjects(
  projects: Project[],
  transactionId: string,
): Project[] {
  return projects.map((project) => {
    if (!(project.payments ?? []).some((payment) => payment.id === transactionId)) return project;
    return syncPaymentStatusFromPayments({
      ...project,
      payments: (project.payments ?? []).filter((payment) => payment.id !== transactionId),
    });
  });
}
