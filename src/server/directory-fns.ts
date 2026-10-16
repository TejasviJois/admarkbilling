import { createServerFn } from "@tanstack/react-start";
import type { Contact } from "@/lib/types";
import { applyOperationsMutation } from "@/lib/operations-mutations";
import { applyProductionBillingRepairs } from "@/lib/ground-zero";
import { encodeDirectoryNotes } from "@/lib/sales-sectors";
import { appendServerAuditLog } from "./activity-log-core";
import { requireRole } from "./app-session.server";
import { actorLabelForUser } from "./portal-users";
import { assertRelationalMode } from "./env";
import { requireServerSupabase } from "./supabase-admin";
import { CACHE_KEYS, cacheSet, cacheThrough } from "./data-cache";
import { loadRelationalOperations, resolveOrganization } from "./relational-read-repository";
import { saveRelationalOperations } from "./relational-write-repository";
import {
  bumpLegacyVersionToken,
  readLegacyVersionToken,
  touchLegacyVersionToken,
} from "./legacy-version-token";

export type DirectoryContactsPayload = {
  contacts: Contact[];
  version: string;
};

const DIRECTORY_CACHE_KEY = CACHE_KEYS.operations + ":contacts";

/** Sales + admin can read the shared directory. */
export const getDirectoryContactsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<DirectoryContactsPayload> => {
    await requireRole(["admin", "sales"]);
    assertRelationalMode();
    const sb = requireServerSupabase();
    const [{ data: versionRow, error }, operations] = await Promise.all([
      sb.from("operations_data").select("updated_at").eq("id", "default").maybeSingle(),
      cacheThrough(DIRECTORY_CACHE_KEY, () =>
        loadRelationalOperations({ includeContacts: true }),
      ),
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
      const latest = await loadRelationalOperations({ includeContacts: true });
      cacheSet(DIRECTORY_CACHE_KEY, latest);
      return {
        ok: false,
        conflict: true,
        contacts: latest.contacts ?? [],
        version,
      };
    }

    const current = await loadRelationalOperations({ includeContacts: true });
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
      const latest = await loadRelationalOperations({ includeContacts: true });
      cacheSet(DIRECTORY_CACHE_KEY, latest);
      return {
        ok: false,
        conflict: true,
        contacts: latest.contacts ?? [],
        version: bumped.version,
      };
    }

    cacheSet(DIRECTORY_CACHE_KEY, finalized);
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

export const saveDirectoryContactFn = createServerFn({ method: "POST" })
  .inputValidator((data: { contact: Contact }) => {
    if (!data?.contact || !data.contact.personName?.trim()) {
      throw new Error("Contact name is required.");
    }
    return data;
  })
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    await requireRole(["admin"]);
    assertRelationalMode();
    const sb = requireServerSupabase();
    const org = await resolveOrganization(sb.schema("admark"));
    const c = data.contact;
    const legacyId = c.id || `contact-${Date.now()}`;
    const personName = c.personName.trim();
    const companyName = c.companyName?.trim() || personName;
    const notes = encodeDirectoryNotes({
      contactVia: c.contactVia,
      sector: c.sector,
      contacted: c.contacted,
      salesWon: c.salesWon,
      designation: c.designation,
    });

    const { error } = await sb
      .schema("admark")
      .from("leads")
      .upsert(
        {
          organization_id: org.id,
          legacy_id: legacyId,
          company_name: companyName,
          contact_person: personName,
          email: c.email || null,
          phone: c.phone || null,
          status: "new_lead",
          source: "Directory",
          notes,
          deleted_at: null,
        },
        { onConflict: "organization_id,legacy_id" },
      );
    if (error) throw error;
    cacheSet(DIRECTORY_CACHE_KEY, null);
    await touchLegacyVersionToken("default");
    return { ok: true };
  });

export const deleteDirectoryContactFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Contact ID is required.");
    return data;
  })
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    await requireRole(["admin"]);
    assertRelationalMode();
    const sb = requireServerSupabase();
    const org = await resolveOrganization(sb.schema("admark"));
    const deletedAt = new Date().toISOString();
    const { error } = await sb
      .schema("admark")
      .from("leads")
      .update({ deleted_at: deletedAt })
      .eq("organization_id", org.id)
      .or(`legacy_id.eq.${data.id},id.eq.${data.id}`);
    if (error) throw error;
    cacheSet(DIRECTORY_CACHE_KEY, null);
    await touchLegacyVersionToken("default");
    return { ok: true };
  });

export const uploadDirectoryContactsFn = createServerFn({ method: "POST" })
  .inputValidator((data: { contacts: Contact[] }) => {
    if (!Array.isArray(data?.contacts)) throw new Error("Contacts list is required.");
    return data;
  })
  .handler(async ({ data }): Promise<{ ok: boolean; count: number }> => {
    await requireRole(["admin"]);
    assertRelationalMode();
    const sb = requireServerSupabase();
    const org = await resolveOrganization(sb.schema("admark"));
    const rows = data.contacts.map((c) => {
      const legacyId = c.id || `contact-${Math.random().toString(36).slice(2, 10)}`;
      const personName = (c.personName || c.companyName || "Unknown").trim();
      const companyName = (c.companyName || personName).trim();
      return {
        organization_id: org.id,
        legacy_id: legacyId,
        company_name: companyName,
        contact_person: personName,
        email: c.email || null,
        phone: c.phone || null,
        status: "new_lead",
        source: "Directory",
        notes: encodeDirectoryNotes({
          contactVia: c.contactVia,
          sector: c.sector,
          contacted: c.contacted,
          salesWon: c.salesWon,
          designation: c.designation,
        }),
        deleted_at: null,
      };
    });

    const CHUNK_SIZE = 500;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const { error } = await sb
        .schema("admark")
        .from("leads")
        .upsert(chunk, { onConflict: "organization_id,legacy_id" });
      if (error) throw error;
    }
    cacheSet(DIRECTORY_CACHE_KEY, null);
    await touchLegacyVersionToken("default");
    return { ok: true, count: rows.length };
  });
