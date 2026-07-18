import { formatINRWhole } from "./invoice-calc";
import { partnershipStatusLabel } from "./partnership-status";
import { projectClientLabel, projectStatusLabel } from "./project-status";
import type {
  ActivityLogEntry,
  ExpenseEntry,
  OperationsData,
  Partnership,
  Project,
  ProjectPayment,
} from "./types";

export const MAX_ACTIVITY_LOGS = 500;

export type LogDraft = Omit<ActivityLogEntry, "id" | "timestamp">;

export function createActivityLogEntry(draft: LogDraft): ActivityLogEntry {
  return {
    ...draft,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  };
}

export function trimActivityLogs(entries: ActivityLogEntry[]): ActivityLogEntry[] {
  return entries
    .slice()
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_ACTIVITY_LOGS);
}

function byId<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

function paymentMap(payments: ProjectPayment[] | undefined): Map<string, ProjectPayment> {
  return new Map((payments ?? []).map((p) => [p.id, p]));
}

function describeProjectFieldChanges(before: Project, after: Project): string[] {
  const changes: string[] = [];
  const label = (field: string, from: string, to: string) => {
    if (from !== to) changes.push(`${field}: ${from || "—"} → ${to || "—"}`);
  };

  label("Client", projectClientLabel(before), projectClientLabel(after));
  label("Type", before.projectType ?? "", after.projectType ?? "");
  label("Status", projectStatusLabel(before.status), projectStatusLabel(after.status));
  label("Revenue", before.revenueValue ?? "", after.revenueValue ?? "");
  label("Start", before.startDate ?? "", after.startDate ?? "");
  label("End", before.endDate ?? "", after.endDate ?? "");

  const beforeBudget = before.budget ?? 0;
  const afterBudget = after.budget ?? 0;
  if (beforeBudget !== afterBudget) {
    changes.push(`Budget: ${formatINRWhole(beforeBudget)} → ${formatINRWhole(afterBudget)}`);
  }

  label("Notes", before.notes ?? "", after.notes ?? "");
  label("Phone", before.phone ?? "", after.phone ?? "");
  label("Email", before.email ?? "", after.email ?? "");
  return changes;
}

function describePartnershipFieldChanges(before: Partnership, after: Partnership): string[] {
  const changes: string[] = [];
  const label = (field: string, from: string, to: string) => {
    if (from !== to) changes.push(`${field}: ${from || "—"} → ${to || "—"}`);
  };

  label("Name", before.name, after.name);
  label("Phone", before.phone ?? "", after.phone ?? "");
  label("Email", before.email ?? "", after.email ?? "");
  label("Contact", before.contact ?? "", after.contact ?? "");
  label("Type", before.type ?? "", after.type ?? "");
  label("Opportunity", before.opportunityType ?? "", after.opportunityType ?? "");
  label("Status", partnershipStatusLabel(before.status), partnershipStatusLabel(after.status));
  label("Notes", before.notes ?? "", after.notes ?? "");
  return changes;
}

function diffProjects(before: Project[], after: Project[]): LogDraft[] {
  const logs: LogDraft[] = [];
  const beforeMap = byId(before);
  const afterMap = byId(after);

  for (const project of after) {
    if (!beforeMap.has(project.id)) {
      logs.push({
        entity: "project",
        action: "created",
        entityId: project.id,
        entityName: projectClientLabel(project),
        summary: `Added project: ${projectClientLabel(project)}`,
      });
    }
  }

  for (const project of before) {
    if (!afterMap.has(project.id)) {
      logs.push({
        entity: "project",
        action: "deleted",
        entityId: project.id,
        entityName: projectClientLabel(project),
        summary: `Removed project: ${projectClientLabel(project)}`,
      });
    }
  }

  for (const project of after) {
    const prior = beforeMap.get(project.id);
    if (!prior) continue;

    const priorPayments = paymentMap(prior.payments);
    const nextPayments = paymentMap(project.payments);
    const label = projectClientLabel(project);

    for (const payment of project.payments ?? []) {
      if (!priorPayments.has(payment.id)) {
        logs.push({
          entity: "project",
          action: "payment_added",
          entityId: project.id,
          entityName: label,
          summary: `Payment ${formatINRWhole(payment.amount)} recorded for ${label}`,
        });
      }
    }

    for (const payment of prior.payments ?? []) {
      if (!nextPayments.has(payment.id)) {
        logs.push({
          entity: "project",
          action: "payment_removed",
          entityId: project.id,
          entityName: label,
          summary: `Payment ${formatINRWhole(payment.amount)} removed from ${label}`,
        });
      }
    }

    const fieldChanges = describeProjectFieldChanges(prior, project);
    if (fieldChanges.length > 0) {
      logs.push({
        entity: "project",
        action: "updated",
        entityId: project.id,
        entityName: label,
        summary: `Updated project ${label}: ${fieldChanges.join("; ")}`,
      });
    }
  }

  return logs;
}

function diffPartnerships(before: Partnership[], after: Partnership[]): LogDraft[] {
  const logs: LogDraft[] = [];
  const beforeMap = byId(before);
  const afterMap = byId(after);

  for (const partnership of after) {
    if (!beforeMap.has(partnership.id)) {
      logs.push({
        entity: "partnership",
        action: "created",
        entityId: partnership.id,
        entityName: partnership.name,
        summary: `Added partnership: ${partnership.name}`,
      });
    }
  }

  for (const partnership of before) {
    if (!afterMap.has(partnership.id)) {
      logs.push({
        entity: "partnership",
        action: "deleted",
        entityId: partnership.id,
        entityName: partnership.name,
        summary: `Removed partnership: ${partnership.name}`,
      });
    }
  }

  for (const partnership of after) {
    const prior = beforeMap.get(partnership.id);
    if (!prior) continue;

    const fieldChanges = describePartnershipFieldChanges(prior, partnership);
    if (fieldChanges.length > 0) {
      logs.push({
        entity: "partnership",
        action: "updated",
        entityId: partnership.id,
        entityName: partnership.name,
        summary: `Updated partnership ${partnership.name}: ${fieldChanges.join("; ")}`,
      });
    }
  }

  return logs;
}

function diffExpenses(before: ExpenseEntry[], after: ExpenseEntry[]): LogDraft[] {
  const logs: LogDraft[] = [];
  const beforeMap = byId(before);
  const afterMap = byId(after);

  for (const expense of after) {
    if (!beforeMap.has(expense.id)) {
      logs.push({
        entity: "expense",
        action: "created",
        entityId: expense.id,
        entityName: expense.label,
        summary: `Added expense: ${expense.label} (${formatINRWhole(expense.amount)}, ${expense.category ?? "company"})`,
      });
    }
  }

  for (const expense of before) {
    if (!afterMap.has(expense.id)) {
      logs.push({
        entity: "expense",
        action: "deleted",
        entityId: expense.id,
        entityName: expense.label,
        summary: `Removed expense: ${expense.label} (${formatINRWhole(expense.amount)})`,
      });
    }
  }

  return logs;
}

export function diffOperationsChanges(before: OperationsData, after: OperationsData): LogDraft[] {
  return [
    ...diffProjects(before.projects, after.projects),
    ...diffPartnerships(before.partnerships, after.partnerships),
    ...diffExpenses(before.expenses, after.expenses),
  ];
}
