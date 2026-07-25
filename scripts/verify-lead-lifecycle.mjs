/**
 * Focused in-memory verification of syncLeadLifecycle.
 * Run: node --experimental-strip-types --experimental-transform-types scripts/verify-lead-lifecycle.mjs
 * Falls back to bundling via esbuild if strip-types is unavailable.
 */
import { pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "src/lib/lead-conversion.ts");

async function loadModule() {
  try {
    return await import(pathToFileURL(source).href);
  } catch {
    const outDir = mkdtempSync(resolve(tmpdir(), "lead-lifecycle-"));
    const outfile = resolve(outDir, "lead-conversion.mjs");
    execFileSync(
      process.execPath,
      [
        resolve(root, "node_modules/esbuild/bin/esbuild"),
        source,
        "--bundle",
        "--platform=node",
        "--format=esm",
        `--outfile=${outfile}`,
      ],
      { stdio: "inherit" },
    );
    try {
      return await import(pathToFileURL(outfile).href);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const emptyOps = () => ({
  projects: [],
  partnerships: [],
  expenses: [],
  leads: [],
  clients: [],
});

const { syncLeadLifecycle, findProjectForLead } = await loadModule();

const lead = {
  id: "lead-acme",
  company: "Acme Corp",
  contactPerson: "Ada Lovelace",
  email: "ada@acme.test",
  phone: "9999999999",
  status: "new_lead",
  expectedRevenue: 100000,
  assignedSalesperson: "member-tejasvi",
  notes: "Hot deal",
  createdAt: "2026-07-18",
};

let ops = { ...emptyOps(), leads: [lead] };

// 1. New lead → no project
ops = syncLeadLifecycle(ops, lead);
assert(ops.projects.length === 0, "New lead must not create a project");
assert(ops.clients.length === 0, "New lead must not create a client");

// 2. Meeting Scheduled → create planning project
const meetingLead = { ...lead, status: "meeting_scheduled" };
ops = syncLeadLifecycle({ ...ops, leads: [meetingLead] }, meetingLead);
assert(ops.projects.length === 1, "Meeting Scheduled creates one project");
assert(ops.projects[0].status === "planning", "Discussion project is planning");
assert(ops.projects[0].leadId === lead.id, "Project linked to lead");
assert(ops.projects[0].id === `proj-lead-${lead.id}`, "Discussion project id is deterministic");
assert(!ops.projects[0].clientId, "Discussion project has no client yet");
const projectId = ops.projects[0].id;
const preservedNotes = "Keep this note forever";
ops = {
  ...ops,
  projects: ops.projects.map((p) =>
    p.id === projectId
      ? { ...p, notes: preservedNotes, milestones: [{ id: "m1", name: "Kickoff", status: "pending" }] }
      : p,
  ),
};

// 3. Proposal / Negotiation → same project, still planning
for (const status of ["proposal_sent", "negotiation"]) {
  const nextLead = { ...meetingLead, status };
  ops = syncLeadLifecycle({ ...ops, leads: [nextLead] }, nextLead);
  assert(ops.projects.length === 1, `${status} must not create a duplicate`);
  assert(ops.projects[0].id === projectId, `${status} reuses the same project`);
  assert(ops.projects[0].status === "planning", `${status} stays In discussions`);
  assert(ops.projects[0].notes === preservedNotes, `${status} preserves notes`);
  assert(ops.projects[0].milestones?.[0]?.id === "m1", `${status} preserves milestones`);
}

// 4. Idempotent re-save at negotiation
const negotiationLead = { ...meetingLead, status: "negotiation" };
ops = syncLeadLifecycle({ ...ops, leads: [negotiationLead] }, negotiationLead);
assert(ops.projects.length === 1, "Idempotent sync must not duplicate");

// 5. Won → client + ongoing
const wonLead = { ...meetingLead, status: "won" };
ops = syncLeadLifecycle({ ...ops, leads: [wonLead] }, wonLead);
assert(ops.clients.length === 1, "Won creates a client");
assert(ops.clients[0].companyName === "Acme Corp", "Client copies company name");
assert(ops.projects.length === 1, "Won must not create a duplicate project");
assert(ops.projects[0].id === projectId, "Won reuses the same project");
assert(ops.projects[0].status === "active", "Won moves project to Ongoing");
assert(ops.projects[0].clientId === ops.clients[0].id, "Won attaches clientId");
assert(ops.leads[0].convertedClientId === ops.clients[0].id, "Lead stores convertedClientId");
assert(ops.projects[0].notes === preservedNotes, "Won preserves notes");
assert(ops.projects[0].milestones?.[0]?.id === "m1", "Won preserves milestones");

// 6. Matching is leadId-only — orphan same-name project must not be stolen
const stray = {
  id: "proj-stray",
  client: "Acme Corp",
  status: "active",
  name: "Acme Corp",
};
const withStray = {
  ...ops,
  projects: [stray, ...ops.projects],
};
const matched = findProjectForLead(withStray.projects, ops.leads[0], ops.clients[0].id);
assert(matched?.id === projectId, "leadId match is the only match");
assert(
  findProjectForLead([stray], { ...wonLead, id: "lead-other" }, ops.clients[0].id) == null,
  "company-name orphan must not match a different lead",
);

// 6b. Second Won deal for same company → new project under existing client
const secondLead = {
  id: "lead-acme-2",
  company: "Acme Corp",
  contactPerson: "Ada Lovelace",
  status: "won",
  expectedRevenue: 50000,
  convertedClientId: ops.clients[0].id,
  createdAt: "2026-07-19",
};
const secondOps = syncLeadLifecycle(
  { ...withStray, leads: [...withStray.leads, secondLead] },
  secondLead,
);
assert(secondOps.clients.length === 1, "Second Won reuses existing client");
assert(
  secondOps.projects.filter((p) => p.leadId === secondLead.id).length === 1,
  "Second Won creates a project for the new lead",
);
assert(
  secondOps.projects.find((p) => p.leadId === secondLead.id)?.id === `proj-lead-${secondLead.id}`,
  "Second project id is deterministic per lead",
);
assert(
  secondOps.projects.find((p) => p.leadId === secondLead.id)?.clientId === ops.clients[0].id,
  "Second project attaches to existing client",
);
assert(
  secondOps.projects.find((p) => p.id === "proj-stray")?.leadId == null,
  "Existing orphan project must stay untouched",
);

// 7. Lost → cancelled, no duplicate
const lostLead = {
  id: "lead-lost",
  company: "Lost Co",
  status: "meeting_scheduled",
  createdAt: "2026-07-18",
};
let lostOps = syncLeadLifecycle({ ...emptyOps(), leads: [lostLead] }, lostLead);
const lostProjectId = lostOps.projects[0].id;
const lostNext = { ...lostLead, status: "lost" };
lostOps = syncLeadLifecycle({ ...lostOps, leads: [lostNext] }, lostNext);
assert(lostOps.projects.length === 1, "Lost must not create a duplicate");
assert(lostOps.projects[0].id === lostProjectId, "Lost reuses the same project");
assert(lostOps.projects[0].status === "cancelled", "Lost moves project to Not interested");
assert(lostOps.clients.length === 0, "Lost must not create a client");

// 8. Archived lead must not create or mutate projects
const archivedLead = {
  id: "lead-archived-open",
  company: "Archive Co",
  status: "meeting_scheduled",
  archivedAt: "2026-07-25",
  createdAt: "2026-07-18",
};
const archivedOps = syncLeadLifecycle({ ...emptyOps(), leads: [archivedLead] }, archivedLead);
assert(archivedOps.projects.length === 0, "Archived lead must not create a project");

console.log("PASS lead lifecycle verification");
console.log(
  JSON.stringify(
    {
      discussionProjectId: projectId,
      wonClientId: ops.clients[0].id,
      secondProjectId: `proj-lead-${secondLead.id}`,
      lostProjectStatus: lostOps.projects[0].status,
    },
    null,
    2,
  ),
);
