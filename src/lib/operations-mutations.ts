import type { OperationsData } from "@/lib/types";

export const OPERATIONS_ENTITY_KEYS = [
  "projects",
  "partnerships",
  "expenses",
  "leads",
  "assets",
  "fixedMonthlyExpenses",
  "clients",
  "contacts",
  "payments",
  "transactions",
  "founders",
  "projectCommissions",
  "notifications",
  "scheduleEvents",
  "valuationSnapshots",
  "valuationAudit",
] as const satisfies readonly (keyof OperationsData)[];

export const OPERATIONS_SCALAR_KEYS = [
  "financialBaseline",
  "valuationSettings",
  "migrationApplied",
  "migrationDate",
  "groundZeroApplied",
  "blxRepairApplied",
  "neRepairApplied",
  "kapilaRetainerRepairApplied",
  "rentManagementContractRepairApplied",
  "historicalExpenseReconciliationApplied",
  "dismissedNotificationIds",
] as const satisfies readonly (keyof OperationsData)[];

export type OperationsEntityKey = (typeof OPERATIONS_ENTITY_KEYS)[number];
export type OperationsScalarKey = (typeof OPERATIONS_SCALAR_KEYS)[number];

type Entity = { id: string } & Record<string, unknown>;

export interface OperationsMutation {
  upserts: Partial<Record<OperationsEntityKey, Entity[]>>;
  deletes: Partial<Record<OperationsEntityKey, string[]>>;
  sets: Partial<Record<OperationsScalarKey, unknown>>;
}

export interface OperationsPersistOptions {
  /** IDs removed by an explicit user action. Unlisted removals are rejected. */
  deleteIds?: Partial<Record<OperationsEntityKey, string[]>>;
  /** Reserved for confirmed full-backup restoration. */
  allowAllDeletes?: boolean;
}

export type PersistOperations = (
  next: OperationsData,
  options?: OperationsPersistOptions,
) => void | Promise<void>;

export class UnsafeOperationsDeleteError extends Error {
  constructor(
    public readonly entity: OperationsEntityKey,
    public readonly ids: string[],
  ) {
    super(`Refused to remove ${ids.length} ${entity} record(s) without explicit delete intent.`);
    this.name = "UnsafeOperationsDeleteError";
  }
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function entities(data: OperationsData, key: OperationsEntityKey): Entity[] {
  const value = data[key];
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error(`${key} must be an array.`);
  return value as unknown as Entity[];
}

function entityMap(items: Entity[], key: OperationsEntityKey): Map<string, Entity> {
  const result = new Map<string, Entity>();
  for (const item of items) {
    if (!item || typeof item.id !== "string" || !item.id) {
      throw new Error(`Every ${key} entity must have a non-empty id.`);
    }
    result.set(item.id, item);
  }
  return result;
}

export function emptyOperationsMutation(): OperationsMutation {
  return { upserts: {}, deletes: {}, sets: {} };
}

export function isOperationsMutationEmpty(mutation: OperationsMutation): boolean {
  return (
    Object.keys(mutation.upserts).length === 0 &&
    Object.keys(mutation.deletes).length === 0 &&
    Object.keys(mutation.sets).length === 0
  );
}

/**
 * Converts the legacy immutable aggregate update into safe entity operations.
 * Removed rows require explicit intent; stale empty arrays can never become deletes.
 */
export function buildOperationsMutation(
  previous: OperationsData,
  next: OperationsData,
  options: OperationsPersistOptions = {},
): OperationsMutation {
  const mutation = emptyOperationsMutation();

  for (const key of OPERATIONS_ENTITY_KEYS) {
    const before = entityMap(entities(previous, key), key);
    const after = entityMap(entities(next, key), key);
    const changed = [...after.values()].filter((item) => !sameValue(before.get(item.id), item));
    if (changed.length > 0) mutation.upserts[key] = changed;

    const removed = [...before.keys()].filter((id) => !after.has(id));
    if (removed.length === 0) continue;

    const allowed = new Set(options.deleteIds?.[key] ?? []);
    const unauthorized = options.allowAllDeletes ? [] : removed.filter((id) => !allowed.has(id));
    if (unauthorized.length > 0) {
      throw new UnsafeOperationsDeleteError(key, unauthorized);
    }
    mutation.deletes[key] = removed;
  }

  for (const key of OPERATIONS_SCALAR_KEYS) {
    if (!sameValue(previous[key], next[key])) {
      mutation.sets[key] = next[key];
    }
  }

  return mutation;
}

export function applyOperationsMutation(
  current: OperationsData,
  mutation: OperationsMutation,
): OperationsData {
  const next = { ...current } as OperationsData;

  for (const key of OPERATIONS_ENTITY_KEYS) {
    const upserts = mutation.upserts[key] ?? [];
    const deletes = new Set(mutation.deletes[key] ?? []);
    if (upserts.length === 0 && deletes.size === 0) continue;

    const byId = entityMap(entities(current, key), key);
    for (const id of deletes) byId.delete(id);
    for (const item of upserts) byId.set(item.id, item);
    (next as unknown as Record<string, unknown>)[key] = [...byId.values()];
  }

  for (const key of OPERATIONS_SCALAR_KEYS) {
    if (Object.prototype.hasOwnProperty.call(mutation.sets, key)) {
      (next as unknown as Record<string, unknown>)[key] = mutation.sets[key];
    }
  }

  return next;
}
