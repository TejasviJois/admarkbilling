import { resolveRelatedProject } from "./invoice-project-link";
import { syncPaymentStatusFromPayments } from "./project-payments";
import type { Invoice, Payment, Project, ProjectPayment, Transaction } from "./types";

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

/**
 * Project-payment id for an invoice "Log payment" row. Must differ from the
 * top-level `ops.payments` id — relational writes dedupe by legacy id and would
 * otherwise keep only the invoice receipt row (recordedAfterMigration: false).
 */
export function invoicePaymentProjectPaymentId(paymentId: string): string {
  return `invoice-recv-${paymentId}`;
}

function projectPaymentFromInvoicePayment(payment: Payment): ProjectPayment {
  return {
    id: invoicePaymentProjectPaymentId(payment.id),
    amount: payment.amount,
    date: payment.date,
    note: payment.notes || `Invoice payment (${payment.method})`,
    recordedAfterMigration: true,
    proof: payment.screenshotDataUrl?.startsWith("data:image/")
      ? {
          imageDataUrl: payment.screenshotDataUrl,
          uploadedAt: new Date().toISOString(),
        }
      : undefined,
  };
}

/**
 * Invoice "Log payment" must reduce the linked project's Ground Zero outstanding
 * the same way Accounts client_payment does — otherwise Projects shows 52k while
 * the invoice correctly shows 29k after a 23k receipt.
 */
export function syncInvoicePaymentToProjects(
  projects: Project[],
  invoices: Invoice[],
  payment: Payment,
): Project[] {
  const invoice =
    (payment.invoiceId
      ? invoices.find((item) => item.id === payment.invoiceId)
      : undefined) ?? null;
  const relatedProjectId =
    payment.projectId ?? (invoice ? resolveRelatedProject(projects, invoice)?.id : undefined);
  if (!relatedProjectId) return projects;

  const nextPayment = projectPaymentFromInvoicePayment(payment);
  const mirrorId = nextPayment.id;
  return projects.map((project) => {
    const without = (project.payments ?? []).filter(
      (item) => item.id !== mirrorId && item.id !== payment.id,
    );
    if (project.id !== relatedProjectId) {
      if (without.length === (project.payments ?? []).length) return project;
      return syncPaymentStatusFromPayments({ ...project, payments: without });
    }
    // Accounts may already have recorded the same receipt as a client_payment.
    // Prefer that row — adding invoice-recv-* would double outstanding reduction
    // (Srivatsanka 10k shown vs real 60k).
    const coveredByAccounts = without.some(
      (item) =>
        item.recordedAfterMigration === true &&
        item.amount === payment.amount &&
        !item.id.startsWith("invoice-recv-"),
    );
    if (coveredByAccounts) {
      return syncPaymentStatusFromPayments({ ...project, payments: without });
    }
    return syncPaymentStatusFromPayments({
      ...project,
      payments: [nextPayment, ...without],
    });
  });
}

export function removeInvoicePaymentFromProjects(
  projects: Project[],
  paymentId: string,
): Project[] {
  const mirrorId = invoicePaymentProjectPaymentId(paymentId);
  return projects.map((project) => {
    const payments = project.payments ?? [];
    if (!payments.some((payment) => payment.id === mirrorId || payment.id === paymentId)) {
      return project;
    }
    return syncPaymentStatusFromPayments({
      ...project,
      payments: payments.filter((payment) => payment.id !== mirrorId && payment.id !== paymentId),
    });
  });
}

/**
 * Reconcile every invoice-linked payment onto its revenue project so Projects /
 * Dashboard outstanding matches invoice Status after historical receipts.
 * Idempotent: mirror ids are stable upserts with recordedAfterMigration.
 */
export function reconcileInvoicePaymentsOntoProjects(
  projects: Project[],
  invoices: Invoice[],
  payments: Payment[],
): Project[] {
  let next = projects;
  for (const payment of payments) {
    if (!payment.invoiceId || !(payment.amount > 0)) continue;
    // Synthetic advance rows use invoice-advance-* ids and are already inside
    // historicalReceived for Ground Zero contracts — never double-count them.
    if (payment.id.startsWith("invoice-advance-")) continue;
    next = syncInvoicePaymentToProjects(next, invoices, payment);
  }
  return next;
}
