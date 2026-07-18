import { formatINRWhole } from "./invoice-calc";
import type { PaymentProof, Project, ProjectPayment } from "./types";

function proofFromLegacy(proof: PaymentProof): NonNullable<ProjectPayment["proof"]> {
  return {
    imageDataUrl: proof.imageDataUrl,
    fileName: proof.fileName,
    mimeType: proof.mimeType,
    uploadedAt: proof.uploadedAt,
  };
}

/** Resolve proof on the payment row, including legacy `paymentProofs` on the project. */
export function resolvePaymentProof(
  project: Project,
  payment: ProjectPayment,
): ProjectPayment["proof"] | undefined {
  if (payment.proof?.imageDataUrl) return payment.proof;

  const legacy = project.paymentProofs ?? [];
  const byId = legacy.find((p) => p.id === payment.id);
  if (byId?.imageDataUrl) return proofFromLegacy(byId);

  const byAmount = legacy.find((p) => {
    const amt = parseInrAmount(p.paymentNote);
    return amt != null && amt === payment.amount;
  });
  if (byAmount?.imageDataUrl) return proofFromLegacy(byAmount);

  return undefined;
}

export function isVerifiedPayment(payment: ProjectPayment, project?: Project): boolean {
  if (payment.proof?.imageDataUrl) return true;
  if (project) return Boolean(resolvePaymentProof(project, payment)?.imageDataUrl);
  return false;
}

function attachLegacyProofs(project: Project): Project {
  const payments = project.payments ?? [];
  if (payments.length === 0) return project;

  const usedLegacyIds = new Set<string>();
  let enriched = payments.map((payment) => {
    if (payment.proof?.imageDataUrl) return payment;
    const proof = resolvePaymentProof(project, payment);
    if (!proof?.imageDataUrl) return payment;
    const legacy = project.paymentProofs?.find(
      (p) =>
        p.id === payment.id ||
        (parseInrAmount(p.paymentNote) === payment.amount && p.imageDataUrl === proof.imageDataUrl),
    );
    if (legacy) usedLegacyIds.add(legacy.id);
    return { ...payment, proof };
  });

  const unusedLegacy = (project.paymentProofs ?? []).filter((p) => !usedLegacyIds.has(p.id));
  if (unusedLegacy.length > 0) {
    enriched = enriched.map((payment) => {
      if (payment.proof?.imageDataUrl) return payment;
      const idx = unusedLegacy.findIndex((p) => parseInrAmount(p.paymentNote) === payment.amount);
      if (idx < 0) return payment;
      const matched = unusedLegacy.splice(idx, 1)[0];
      usedLegacyIds.add(matched.id);
      return { ...payment, proof: proofFromLegacy(matched) };
    });
  }

  return { ...project, payments: enriched };
}

/** Pull the first rupee figure from text like "₹24,000", "₹1,40,000 + ₹8K/month". */
export function parseInrAmount(text: string | undefined): number | null {
  if (!text?.trim()) return null;
  const match = text.match(/₹\s*([\d,]+(?:\.\d+)?)/);
  if (!match) return null;
  const n = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Best-effort contract total from revenue value (first ₹ amount only). */
export function parseRevenueTarget(revenueValue: string | undefined): number | null {
  return parseInrAmount(revenueValue);
}

export function sumProjectPayments(payments: ProjectPayment[] | undefined): number {
  return (payments ?? []).reduce((s, p) => s + (p.amount || 0), 0);
}

/** Payments collected before the Ground Zero migration — imported once from Excel. */
export function historicalReceived(project: Project): number {
  return project.historicalReceived ?? 0;
}

/** Payments explicitly created from the Accounts ledger after Ground Zero. */
export function sumReceivedAfterMigration(project: Project): number {
  const payments = project.payments ?? [];
  // Projects outside the Ground Zero model retain their legacy behavior.
  if (project.historicalReceived == null) return sumProjectPayments(payments);
  return sumProjectPayments(payments.filter((payment) => payment.recordedAfterMigration === true));
}

/** Total Received = Historical Received + Received After Migration. */
export function totalReceived(project: Project): number {
  return historicalReceived(project) + sumReceivedAfterMigration(project);
}

/** Income from project payments that have an uploaded proof screenshot. */
export function sumVerifiedProjectPayments(projects: Project[]): number {
  return projects.reduce((total, project) => {
    const verified = (project.payments ?? [])
      .filter((p) => isVerifiedPayment(p, project))
      .reduce((s, p) => s + (p.amount || 0), 0);
    return total + verified;
  }, 0);
}

export function verifiedProjectPaymentsByMonth(
  projects: Project[],
): Map<string, number> {
  const months = new Map<string, number>();
  for (const project of projects) {
    for (const payment of project.payments ?? []) {
      if (!isVerifiedPayment(payment, project)) continue;
      const key = payment.date.slice(0, 7);
      if (key.length !== 7) continue;
      months.set(key, (months.get(key) ?? 0) + (payment.amount || 0));
    }
  }
  return months;
}

export function syncPaymentStatusFromPayments(project: Project): Project {
  const payments = project.payments ?? [];
  const historical = historicalReceived(project);
  if (payments.length === 0 && historical <= 0) {
    return {
      ...project,
      payments: [],
      paymentStatus: undefined,
    };
  }

  const total = historical + sumReceivedAfterMigration(project);
  const target = contractTargetFromProject(project);
  const parts = [`${formatINRWhole(total)} received`];
  const pending =
    project.historicalOutstanding !== undefined
      ? project.historicalOutstanding == null
        ? null
        : Math.max(0, project.historicalOutstanding - sumReceivedAfterMigration(project))
      : target != null
        ? Math.max(0, target - total)
        : null;

  if (payments.length > 1) parts.push(`${payments.length} payments`);
  if (pending != null && pending > 0) parts.push(`${formatINRWhole(pending)} remaining`);
  if (pending === 0) parts.push("settled");

  return { ...project, paymentStatus: parts.join(" · ") };
}

export function normalizeProjectPayments(project: Project): Project {
  if (project.payments && project.payments.length > 0) {
    return syncPaymentStatusFromPayments(attachLegacyProofs(project));
  }

  // Ground Zero projects: historical received is a field, never synthesized rows.
  if (project.historicalReceived != null) {
    return syncPaymentStatusFromPayments(project);
  }

  const payments: ProjectPayment[] = [];

  for (const proof of project.paymentProofs ?? []) {
    payments.push({
      id: proof.id,
      amount: parseInrAmount(proof.paymentNote) ?? 0,
      date: proof.uploadedAt.slice(0, 10),
      note: proof.paymentNote,
      proof: {
        imageDataUrl: proof.imageDataUrl,
        fileName: proof.fileName,
        mimeType: proof.mimeType,
        uploadedAt: proof.uploadedAt,
      },
    });
  }

  if (payments.length === 0 && project.paymentStatus?.trim()) {
    const amount = parseInrAmount(project.paymentStatus);
    if (amount != null) {
      payments.push({
        id: crypto.randomUUID(),
        amount,
        date: new Date().toISOString().slice(0, 10),
        note: project.paymentStatus.trim(),
      });
    }
  }

  if (payments.length === 0) return project;
  return syncPaymentStatusFromPayments({ ...project, payments });
}

export function normalizeAllProjectPayments(projects: Project[]): Project[] {
  return projects.map(normalizeProjectPayments);
}

export function paymentSummary(project: Project): {
  /** Total Received = Historical Received + Received After Migration. */
  received: number;
  historicalReceived: number;
  receivedAfterMigration: number;
  target: number | null;
  pending: number | null;
  count: number;
} {
  const payments = project.payments ?? [];
  const receivedAfterMigration = sumReceivedAfterMigration(project);
  const historical = historicalReceived(project);
  const received = historical + receivedAfterMigration;
  const target = contractTargetFromProject(project);
  const pending =
    project.historicalOutstanding !== undefined
      ? project.historicalOutstanding == null
        ? null
        : Math.max(0, project.historicalOutstanding - receivedAfterMigration)
      : target != null && received < target
        ? target - received
        : target != null
          ? 0
          : null;
  return {
    received,
    historicalReceived: historical,
    receivedAfterMigration,
    target,
    pending,
    count: payments.length,
  };
}

/**
 * Outstanding as a number for KPI totals. When pending is explicitly unknown
 * (null), estimate from contract value minus received instead of silently
 * counting ₹0 and understating receivables.
 */
export function estimatedPending(project: Project): number {
  const summary = paymentSummary(project);
  if (summary.pending != null) return summary.pending;
  if (summary.target != null) return Math.max(0, summary.target - summary.received);
  return 0;
}

/**
 * Contract total without importing project-billing (avoids circular deps).
 * Monthly retainers are recurring income (MRR / future monthly) — their
 * months are NEVER accumulated into a contract value or outstanding.
 * An explicit contractValue of 0 means "no contract — recurring only".
 */
function contractTargetFromProject(project: Project): number | null {
  const b = project.billing ?? {};
  if (b.contractValue != null) return b.contractValue > 0 ? b.contractValue : null;
  // Explicit form entries win over legacy revenueValue text — a typed 0 sticks.
  if (b.upfrontAmount != null || b.maintenanceAmount != null) {
    const total = (b.upfrontAmount ?? 0) + (b.maintenanceAmount ?? 0);
    return total > 0 ? total : null;
  }
  const parsed = project.revenueValue?.trim() ?? "";
  if (!parsed || /partner|discount|tbd|—|\/\s*month/i.test(parsed)) return null;
  return parseInrAmount(parsed);
}

export function paymentProofSummary(project: Project): {
  withProof: number;
  withoutProof: number;
  total: number;
} {
  const payments = project.payments ?? [];
  const withProof = payments.filter((p) => isVerifiedPayment(p, project)).length;
  return { withProof, withoutProof: payments.length - withProof, total: payments.length };
}

/** Latest payment row that has a resolved proof screenshot. */
export function latestPaymentProof(
  project: Project,
): { payment: ProjectPayment; imageUrl: string } | null {
  for (const payment of project.payments ?? []) {
    const proof = resolvePaymentProof(project, payment);
    if (proof?.imageDataUrl) {
      return { payment, imageUrl: proof.imageDataUrl };
    }
  }
  return null;
}
