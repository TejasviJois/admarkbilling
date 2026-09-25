import { createServerFn } from "@tanstack/react-start";
import type { LeadListEntry } from "@/lib/types";
import { applyOperationsMutation } from "@/lib/operations-mutations";
import { applyProductionBillingRepairs } from "@/lib/ground-zero";
import { appendServerAuditLog } from "./activity-log-core";
import { requireRole } from "./app-session.server";
import { actorLabelForUser } from "./portal-users";
import { assertRelationalMode } from "./env";
import { requireServerSupabase } from "./supabase-admin";
import { CACHE_KEYS, cacheSet, cacheThrough } from "./data-cache";
import { loadRelationalOperations } from "./relational-read-repository";
import { saveRelationalOperations } from "./relational-write-repository";
import { bumpLegacyVersionToken, readLegacyVersionToken } from "./legacy-version-token";

export type LeadListPayload = {
  entries: LeadListEntry[];
  version: string;
};

export const getLeadListFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<LeadListPayload> => {
    await requireRole(["admin", "sales"]);
    assertRelationalMode();
    const sb = requireServerSupabase();
    const [{ data: versionRow, error }, operations] = await Promise.all([
      sb.from("operations_data").select("updated_at").eq("id", "default").maybeSingle(),
      cacheThrough(CACHE_KEYS.operations, loadRelationalOperations),
    ]);
    if (error) throw error;
    if (!versionRow?.updated_at) {
      throw new Error("operations_data/default is missing a concurrency version.");
    }
    return {
      entries: operations.leadList ?? [],
      version: versionRow.updated_at,
    };
  },
);

export const patchLeadListContactedFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; contacted: boolean; expectedVersion: string }) => {
    if (
      !data ||
      typeof data.id !== "string" ||
      typeof data.contacted !== "boolean" ||
      typeof data.expectedVersion !== "string"
    ) {
      throw new Error("Invalid lead-list patch payload.");
    }
    return data;
  })
  .handler(async ({ data }): Promise<LeadListPayload & { ok: boolean; conflict?: boolean }> => {
    const session = await requireRole(["admin", "sales"]);
    assertRelationalMode();

    const version = await readLegacyVersionToken("default");
    if (version !== data.expectedVersion) {
      const latest = await loadRelationalOperations();
      cacheSet(CACHE_KEYS.operations, latest);
      return {
        ok: false,
        conflict: true,
        entries: latest.leadList ?? [],
        version,
      };
    }

    const current = await loadRelationalOperations();
    const existing = (current.leadList ?? []).find((entry) => entry.id === data.id);
    if (!existing) {
      throw new Error("Lead list entry not found.");
    }

    const patched: LeadListEntry = { ...existing, contacted: data.contacted };
    const finalized = applyProductionBillingRepairs(
      applyOperationsMutation(current, {
        upserts: {
          leadList: [patched as unknown as { id: string } & Record<string, unknown>],
        },
        deletes: {},
        sets: {},
      }),
    );
    await saveRelationalOperations(finalized);

    const bumped = await bumpLegacyVersionToken("default", data.expectedVersion);
    if (!bumped.ok) {
      const latest = await loadRelationalOperations();
      cacheSet(CACHE_KEYS.operations, latest);
      return {
        ok: false,
        conflict: true,
        entries: latest.leadList ?? [],
        version: bumped.version,
      };
    }

    cacheSet(CACHE_KEYS.operations, finalized);

    await appendServerAuditLog({
      entity: "lead",
      action: "updated",
      entityId: data.id,
      entityName: existing.title || existing.externalId || data.id,
      summary: `${actorLabelForUser(session)} marked lead ${existing.externalId || data.id} as ${
        data.contacted ? "contacted" : "not contacted"
      }`,
    });

    return {
      ok: true,
      entries: finalized.leadList ?? [],
      version: bumped.version,
    };
  });

export const importLeadListFn = createServerFn({ method: "POST" })
  .inputValidator((data: { entries: LeadListEntry[]; expectedVersion: string }) => {
    if (
      !data ||
      !Array.isArray(data.entries) ||
      typeof data.expectedVersion !== "string" ||
      data.entries.length === 0
    ) {
      throw new Error("Invalid lead-list import payload.");
    }
    for (const entry of data.entries) {
      if (
        !entry ||
        typeof entry.id !== "string" ||
        typeof entry.externalId !== "string" ||
        typeof entry.title !== "string" ||
        typeof entry.importedAt !== "string"
      ) {
        throw new Error("Invalid lead-list entry in import payload.");
      }
    }
    return data;
  })
  .handler(async ({ data }): Promise<LeadListPayload & { ok: boolean; conflict?: boolean; imported: number }> => {
    const session = await requireRole(["admin", "sales"]);
    assertRelationalMode();

    const version = await readLegacyVersionToken("default");
    if (version !== data.expectedVersion) {
      const latest = await loadRelationalOperations();
      cacheSet(CACHE_KEYS.operations, latest);
      return {
        ok: false,
        conflict: true,
        imported: 0,
        entries: latest.leadList ?? [],
        version,
      };
    }

    const current = await loadRelationalOperations();
    const existing = current.leadList ?? [];
    const byExternal = new Map(existing.map((entry) => [entry.externalId.toLowerCase(), entry]));
    for (const entry of data.entries) {
      const key = entry.externalId.toLowerCase();
      const prior = byExternal.get(key);
      byExternal.set(
        key,
        prior
          ? { ...entry, id: prior.id, contacted: prior.contacted, salesWon: prior.salesWon }
          : entry,
      );
    }
    const merged = [...byExternal.values()].sort((a, b) => {
      const score = (b.leadScore ?? 0) - (a.leadScore ?? 0);
      if (score !== 0) return score;
      return a.externalId.localeCompare(b.externalId, undefined, { numeric: true });
    });

    const finalized = applyProductionBillingRepairs(
      applyOperationsMutation(current, {
        upserts: {
          leadList: merged as unknown as Array<{ id: string } & Record<string, unknown>>,
        },
        deletes: {},
        sets: {},
      }),
    );
    await saveRelationalOperations(finalized);

    const bumped = await bumpLegacyVersionToken("default", data.expectedVersion);
    if (!bumped.ok) {
      const latest = await loadRelationalOperations();
      cacheSet(CACHE_KEYS.operations, latest);
      return {
        ok: false,
        conflict: true,
        imported: 0,
        entries: latest.leadList ?? [],
        version: bumped.version,
      };
    }

    cacheSet(CACHE_KEYS.operations, finalized);

    await appendServerAuditLog({
      entity: "lead",
      action: "updated",
      entityId: "lead-list",
      entityName: "Lead List",
      summary: `${actorLabelForUser(session)} imported ${data.entries.length} lead list entr${
        data.entries.length === 1 ? "y" : "ies"
      }`,
    });

    return {
      ok: true,
      imported: data.entries.length,
      entries: finalized.leadList ?? [],
      version: bumped.version,
    };
  });
