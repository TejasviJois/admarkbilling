import { createServerFn } from "@tanstack/react-start";
import type { Contact } from "@/lib/types";
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

export type DirectoryContactsPayload = {
  contacts: Contact[];
  version: string;
};

/** Sales + admin can read the shared directory. */
export const getDirectoryContactsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<DirectoryContactsPayload> => {
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
      contacts: operations.contacts ?? [],
      version: versionRow.updated_at,
    };
  },
);

export const patchDirectoryContactedFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; contacted: boolean; expectedVersion: string }) => {
    if (
      !data ||
      typeof data.id !== "string" ||
      typeof data.contacted !== "boolean" ||
      typeof data.expectedVersion !== "string"
    ) {
      throw new Error("Invalid directory contacted patch.");
    }
    return data;
  })
  .handler(async ({ data }): Promise<DirectoryContactsPayload & { ok: boolean; conflict?: boolean }> => {
    const session = await requireRole(["admin", "sales"]);
    assertRelationalMode();

    const version = await readLegacyVersionToken("default");
    if (version !== data.expectedVersion) {
      const latest = await loadRelationalOperations();
      cacheSet(CACHE_KEYS.operations, latest);
      return {
        ok: false,
        conflict: true,
        contacts: latest.contacts ?? [],
        version,
      };
    }

    const current = await loadRelationalOperations();
    const existing = (current.contacts ?? []).find((contact) => contact.id === data.id);
    if (!existing) {
      throw new Error("Directory contact not found.");
    }

    const patched: Contact = { ...existing, contacted: data.contacted };
    const finalized = applyProductionBillingRepairs(
      applyOperationsMutation(current, {
        upserts: {
          contacts: [patched as unknown as { id: string } & Record<string, unknown>],
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
        contacts: latest.contacts ?? [],
        version: bumped.version,
      };
    }

    cacheSet(CACHE_KEYS.operations, finalized);
    await appendServerAuditLog({
      entity: "lead",
      action: "updated",
      entityId: data.id,
      entityName: existing.personName || data.id,
      summary: `${actorLabelForUser(session)} marked directory contact ${existing.personName || data.id} as ${
        data.contacted ? "contacted" : "not contacted"
      }`,
    });

    return {
      ok: true,
      contacts: finalized.contacts ?? [],
      version: bumped.version,
    };
  });
