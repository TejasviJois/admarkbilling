import { paymentSummary } from "./project-payments";
import { isRevenueProject } from "./project-status";
import type { Invoice, Project, Transaction } from "./types";

/**
 * Revenue projects this invoice could collect against — matched strictly by
 * the stored clientId, or by exact client-name match as a fallback.
 */
export function invoiceProjectCandidates(
  projects: Project[],
  inv: Pick<Invoice, "clientId" | "clientName" | "projectId">,
): Project[] {
  if (inv.projectId) {
    const explicit = projects.find((project) => project.id === inv.projectId);
    if (explicit) return [explicit];
  }
  const name = inv.clientName.trim().toLowerCase();
  return projects.filter(
    (project) =>
      isRevenueProject(project.status) &&
      ((inv.clientId != null && project.clientId === inv.clientId) ||
        project.client?.trim().toLowerCase() === name),
  );
}

/**
 * Default project when the user hasn't picked one explicitly: with several
 * candidates, the one with the largest outstanding wins.
 */
export function resolveRelatedProject(
  projects: Project[],
  inv: Pick<Invoice, "clientId" | "clientName" | "projectId">,
): Project | undefined {
  const candidates = invoiceProjectCandidates(projects, inv);
  if (candidates.length <= 1) return candidates[0];
  return candidates.reduce((best, current) =>
    (paymentSummary(current).pending ?? 0) > (paymentSummary(best).pending ?? 0) ? current : best,
  );
}

/** Deterministic ledger id — lets create/edit/delete upsert the same row. */
export function invoiceAdvanceTransactionId(invoiceId: string): string {
  return `invoice-advance-${invoiceId}`;
}

/**
 * The advance recorded on an invoice is money actually received, so it must
 * hit the Accounts ledger (and, via sync, the project's received/outstanding)
 * exactly like a logged payment.
 */
export function buildInvoiceAdvanceTransaction(
  invoice: Invoice,
  relatedProjectId: string | undefined,
  relatedClientId: string | undefined,
): Transaction {
  const now = Date.now();
  return {
    id: invoiceAdvanceTransactionId(invoice.id),
    type: "client_payment",
    date: invoice.paymentDate || invoice.date,
    amount: invoice.advance,
    description: `Advance on ${invoice.number} from ${invoice.clientName}`,
    category: "Client Income",
    paymentMethod: invoice.paymentMode || "other",
    relatedClientId,
    relatedProjectId,
    relatedInvoiceId: invoice.id,
    notes: "Advance recorded on the invoice.",
    createdAt: now,
    updatedAt: now,
  };
}
