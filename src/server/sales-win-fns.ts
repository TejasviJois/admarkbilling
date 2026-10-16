import { createServerFn } from "@tanstack/react-start";
import { applyOperationsMutation } from "@/lib/operations-mutations";
import { applyProductionBillingRepairs } from "@/lib/ground-zero";
import { removeProjectCommission, upsertProjectCommission } from "@/lib/ops-costs";
import type { Client, Contact, LeadListEntry, Project, ProjectCommission } from "@/lib/types";
import { appendServerAuditLog } from "./activity-log-core";
import { requireRole } from "./app-session.server";
import { actorLabelForUser } from "./portal-users";
import { assertRelationalMode } from "./env";
import { CACHE_KEYS, cacheSet, cacheThrough } from "./data-cache";
import { loadRelationalCompany, loadRelationalOperations } from "./relational-read-repository";
import { saveRelationalOperations } from "./relational-write-repository";
import { bumpLegacyVersionToken, readLegacyVersionToken } from "./legacy-version-token";

export type RecordSalesWinInput = {
  clientName: string;
  phone?: string;
  email?: string;
  projectName?: string;
  /** Closed / negotiated price — set by sales. */
  contractValue: number;
  /** Always 0 from sales UI; admin fills commission in Office & Ops. */
  commissionAmount?: number;
  leadListEntryId?: string;
  directoryContactId?: string;
  notes?: string;
};

export type RecordSalesWinResult = {
  ok: true;
  projectId: string;
  clientId: string;
  commissionId: string;
};

const SOURCE_MARKER = /\[sales-win:(leadList|directory):([^\]]+)\]/;

function slugId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function sourceMarker(kind: "leadList" | "directory", id: string): string {
  return `[sales-win:${kind}:${id}]`;
}

function findExistingSalesWinProject(
  projects: Project[],
  kind: "leadList" | "directory",
  id: string,
): Project | undefined {
  const needle = sourceMarker(kind, id);
  return projects.find((project) => project.notes?.includes(needle));
}

function otherProjectsForClient(projects: Project[], clientId: string, excludeProjectId: string): boolean {
  return projects.some((project) => project.clientId === clientId && project.id !== excludeProjectId);
}

export const recordSalesWinFn = createServerFn({ method: "POST" })
  .inputValidator((data: RecordSalesWinInput) => {
    if (!data || typeof data.clientName !== "string" || !data.clientName.trim()) {
      throw new Error("Client name is required.");
    }
    if (typeof data.contractValue !== "number" || !(data.contractValue >= 0)) {
      throw new Error("Closed price must be a non-negative number.");
    }
    const commissionAmount =
      typeof data.commissionAmount === "number" && data.commissionAmount >= 0
        ? data.commissionAmount
        : 0;
    return {
      clientName: data.clientName.trim(),
      phone: typeof data.phone === "string" ? data.phone.trim() : undefined,
      email: typeof data.email === "string" ? data.email.trim() : undefined,
      projectName:
        typeof data.projectName === "string" && data.projectName.trim()
          ? data.projectName.trim()
          : undefined,
      contractValue: data.contractValue,
      commissionAmount,
      leadListEntryId:
        typeof data.leadListEntryId === "string" ? data.leadListEntryId : undefined,
      directoryContactId:
        typeof data.directoryContactId === "string" ? data.directoryContactId : undefined,
      notes: typeof data.notes === "string" ? data.notes.trim() : undefined,
    };
  })
  .handler(async ({ data }): Promise<RecordSalesWinResult> => {
    const session = await requireRole(["admin", "sales"]);
    assertRelationalMode();

    // Sales must never set commission via API — admin fills it in Office & Ops.
    const commissionAmount = session.role === "sales" ? 0 : data.commissionAmount;

    const teamMemberId = session.teamMemberId;
    if (session.role === "sales" && !teamMemberId) {
      throw new Error("Sales login is not linked to a Team member. Ask an admin to fix it.");
    }

    const company = await loadRelationalCompany();
    const member = (company.companyMembers ?? []).find((item) => item.id === teamMemberId);
    const personName = member?.name || session.displayName || session.username;

    const version = await readLegacyVersionToken("default");
    const current = await cacheThrough(
      data.directoryContactId ? CACHE_KEYS.operations + ":contacts" : CACHE_KEYS.operations,
      () => loadRelationalOperations({ includeContacts: Boolean(data.directoryContactId) }),
    );

    const today = new Date().toISOString().slice(0, 10);
    const clientId = slugId("cli");
    const projectId = slugId("proj");
    const commissionId = slugId("comm");

    const leadEntry: LeadListEntry | undefined = data.leadListEntryId
      ? (current.leadList ?? []).find((entry) => entry.id === data.leadListEntryId)
      : undefined;
    const directoryContact: Contact | undefined = data.directoryContactId
      ? (current.contacts ?? []).find((entry) => entry.id === data.directoryContactId)
      : undefined;

    if (data.leadListEntryId && !leadEntry) {
      throw new Error("Lead List entry not found.");
    }
    if (data.directoryContactId && !directoryContact) {
      throw new Error("Directory contact not found.");
    }

    if (leadEntry) {
      if (leadEntry.salesWon) {
        throw new Error("This lead already has a win recorded.");
      }
      const existing = findExistingSalesWinProject(current.projects ?? [], "leadList", leadEntry.id);
      if (existing) {
        throw new Error("This lead already has a win recorded.");
      }
    }
    if (directoryContact) {
      if (directoryContact.salesWon) {
        throw new Error("This contact already has a win recorded.");
      }
      const existing = findExistingSalesWinProject(
        current.projects ?? [],
        "directory",
        directoryContact.id,
      );
      if (existing) {
        throw new Error("This contact already has a win recorded.");
      }
    }

    const phone = data.phone || leadEntry?.phone || directoryContact?.phone || "";
    const email = data.email || leadEntry?.email || directoryContact?.email || "";

    const marker = leadEntry
      ? sourceMarker("leadList", leadEntry.id)
      : directoryContact
        ? sourceMarker("directory", directoryContact.id)
        : null;

    const client: Client = {
      id: clientId,
      companyName: data.clientName,
      contactPerson: personName,
      phone,
      email,
      billingAddress: "",
      clientSince: today,
      status: "active",
      notes: data.notes
        ? `Won by ${personName}. ${data.notes}`
        : `Won by ${personName} (sales portal).`,
    };

    const projectNotes = [
      marker,
      leadEntry
        ? `Converted from Lead List ${leadEntry.externalId}. ${leadEntry.title}`
        : directoryContact
          ? `Converted from Directory contact ${directoryContact.personName}.`
          : `Recorded by ${personName} via sales portal.`,
      data.notes ? `Deal notes: ${data.notes}` : null,
      "Commission pending admin in Office & Ops.",
    ]
      .filter(Boolean)
      .join(" ");

    const project: Project = {
      id: projectId,
      clientId,
      client: data.clientName,
      name: data.projectName || data.clientName,
      status: "active",
      startDate: today,
      phone: phone || undefined,
      email: email || undefined,
      notes: projectNotes,
      assignedMembers: teamMemberId ? [teamMemberId] : undefined,
      billing: data.contractValue > 0 ? { contractValue: data.contractValue } : undefined,
    };

    const commission: ProjectCommission = {
      id: commissionId,
      projectId,
      label: `Sales commission — ${personName}`,
      splits: [
        {
          id: slugId("split"),
          personName,
          teamMemberId: teamMemberId || undefined,
          amount: commissionAmount,
        },
      ],
      status: "planned",
      notes:
        commissionAmount > 0
          ? "Created from sales win."
          : "Closed price recorded by sales. Admin sets commission amount in Office & Ops.",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    type EntityRow = { id: string } & Record<string, unknown>;
    let next = applyProductionBillingRepairs(
      applyOperationsMutation(current, {
        upserts: {
          clients: [client as unknown as EntityRow],
          projects: [project as unknown as EntityRow],
        },
        deletes: {},
        sets: {},
      }),
    );
    next = upsertProjectCommission(next, commission);

    if (leadEntry) {
      const patchedLead: LeadListEntry = {
        ...leadEntry,
        contacted: true,
        salesWon: true,
      };
      next = applyOperationsMutation(next, {
        upserts: {
          leadList: [patchedLead as unknown as EntityRow],
        },
        deletes: {},
        sets: {},
      });
    }
    if (directoryContact) {
      const patchedContact: Contact = {
        ...directoryContact,
        contacted: true,
        salesWon: true,
      };
      next = applyOperationsMutation(next, {
        upserts: {
          contacts: [patchedContact as unknown as EntityRow],
        },
        deletes: {},
        sets: {},
      });
    }

    next = applyProductionBillingRepairs(next);
    await saveRelationalOperations(next);
    const bumped = await bumpLegacyVersionToken("default", version);
    if (!bumped.ok) {
      throw new Error("Could not save win — data changed. Try again.");
    }
    cacheSet(CACHE_KEYS.operations, next);

    await appendServerAuditLog({
      entity: "lead",
      action: "created",
      entityId: projectId,
      entityName: data.clientName,
      summary: `${actorLabelForUser(session)} recorded sales win ${data.clientName} (closed ₹${data.contractValue})`,
    });

    return { ok: true, projectId, clientId, commissionId };
  });

export const listMyCommissionsFn = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireRole(["admin", "sales"]);
  assertRelationalMode();
  const ops = await cacheThrough(CACHE_KEYS.operations, loadRelationalOperations);
  const commissions = ops.projectCommissions ?? [];
  const projects = ops.projects ?? [];

  const salesWinProjectIds = new Set(
    projects
      .filter((project) => SOURCE_MARKER.test(project.notes ?? ""))
      .map((project) => project.id),
  );

  if (session.role === "admin") {
    const salesWins = commissions.filter((commission) => salesWinProjectIds.has(commission.projectId));
    const projectIds = new Set(salesWins.map((item) => item.projectId));
    return {
      commissions: salesWins,
      projects: projects.filter((project) => projectIds.has(project.id)),
    };
  }

  const mid = session.teamMemberId;
  const mine = commissions.filter(
    (commission) =>
      salesWinProjectIds.has(commission.projectId) &&
      (commission.splits ?? []).some((split) => split.teamMemberId === mid),
  );
  const projectIds = new Set(mine.map((item) => item.projectId));
  return {
    commissions: mine,
    projects: projects.filter((project) => projectIds.has(project.id)),
  };
});

export const revertSalesWinFn = createServerFn({ method: "POST" })
  .inputValidator((data: { commissionId: string }) => {
    if (!data || typeof data.commissionId !== "string" || !data.commissionId.trim()) {
      throw new Error("Commission id is required.");
    }
    return { commissionId: data.commissionId.trim() };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const session = await requireRole(["admin", "sales"]);
    assertRelationalMode();

    const version = await readLegacyVersionToken("default");
    const current = await cacheThrough(CACHE_KEYS.operations, loadRelationalOperations);
    const commission = (current.projectCommissions ?? []).find((item) => item.id === data.commissionId);
    if (!commission) throw new Error("Win not found.");

    if (session.role === "sales") {
      const mid = session.teamMemberId;
      const owned = (commission.splits ?? []).some((split) => split.teamMemberId === mid);
      if (!owned) throw new Error("You can only revert your own wins.");
    }
    if (commission.status === "paid" || commission.status === "partial") {
      throw new Error("This commission is already paid (or partial). Ask an admin to reverse it.");
    }

    const project = (current.projects ?? []).find((item) => item.id === commission.projectId);
    if (!project) throw new Error("Win project not found.");

    const markerMatch = project.notes?.match(SOURCE_MARKER);
    if (!markerMatch) {
      throw new Error("Only sales-portal wins can be reverted here.");
    }

    const clientId = project.clientId;
    const deleteClient =
      Boolean(clientId) && !otherProjectsForClient(current.projects ?? [], clientId!, project.id);

    type EntityRow = { id: string } & Record<string, unknown>;
    let next = removeProjectCommission(current, commission.id);
    next = applyOperationsMutation(next, {
      upserts: {},
      deletes: {
        projects: [project.id],
        clients: deleteClient && clientId ? [clientId] : [],
      },
      sets: {},
    });

    // Keep source on Contacted (contacted = true), clear won flag so Win is available again.
    if (markerMatch[1] === "leadList" && markerMatch[2]) {
      const lead = (next.leadList ?? []).find((entry) => entry.id === markerMatch[2]);
      if (lead) {
        next = applyOperationsMutation(next, {
          upserts: {
            leadList: [
              { ...lead, contacted: true, salesWon: false } as unknown as EntityRow,
            ],
          },
          deletes: {},
          sets: {},
        });
      }
    }
    if (markerMatch[1] === "directory" && markerMatch[2]) {
      const opsWithContacts = await loadRelationalOperations({ includeContacts: true });
      const contact = (opsWithContacts.contacts ?? []).find((entry) => entry.id === markerMatch[2]);
      if (contact) {
        next = applyOperationsMutation(
          { ...next, contacts: opsWithContacts.contacts },
          {
            upserts: {
              contacts: [
                { ...contact, contacted: true, salesWon: false } as unknown as EntityRow,
              ],
            },
            deletes: {},
            sets: {},
          },
        );
      }
    }

    next = applyProductionBillingRepairs(next);
    await saveRelationalOperations(next);
    const bumped = await bumpLegacyVersionToken("default", version);
    if (!bumped.ok) {
      throw new Error("Could not revert win — data changed. Try again.");
    }
    cacheSet(CACHE_KEYS.operations, next);

    await appendServerAuditLog({
      entity: "lead",
      action: "deleted",
      entityId: commission.projectId,
      entityName: project.client || project.name || commission.projectId,
      summary: `${actorLabelForUser(session)} reverted sales win ${project.client || commission.projectId} back to Contacted`,
    });

    return { ok: true };
  });
