import { useEffect, useState, useMemo } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  ArrowLeft,
  Briefcase,
  FileText,
  Calendar,
  Building,
  DollarSign,
  Activity,
  FileDigit,
} from "lucide-react";
import { useOperations } from "@/hooks/use-operations";
import { useInvoices } from "@/hooks/use-invoices";
import { useDocuments } from "@/hooks/use-documents";
import { loadActivityLogs } from "@/lib/activity-log-storage";
import { computeTotals, formatINR, formatINRWhole } from "@/lib/invoice-calc";
import { formatActivityTimestamp } from "@/lib/activity-log-labels";
import { clientRelationshipMembers, projectsForClientRelationship } from "@/lib/client-projects";
import { estimatedPending, paymentSummary } from "@/lib/project-payments";
import { safeHref } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { ActivityLogEntry } from "@/lib/types";

export const Route = createFileRoute("/clients/$id")({
  component: ClientOverviewPage,
});

function ClientOverviewPage() {
  const { id } = Route.useParams();
  const router = useRouter();
  const { ops, loading: opsLoading } = useOperations();
  const { invoices, loading: invLoading } = useInvoices();
  const { docs, loading: docsLoading } = useDocuments();
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);

  // Load activity logs
  useEffect(() => {
    loadActivityLogs()
      .then((data) => {
        setLogs(data);
        setLogsLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load activity logs:", err);
        setLogsLoading(false);
      });
  }, []);

  const client = useMemo(() => {
    return ops.clients?.find((c) => c.id === id);
  }, [ops.clients, id]);

  const relationshipClients = useMemo(() => {
    if (!client) return [];
    return clientRelationshipMembers(client, ops.clients ?? []);
  }, [ops.clients, client]);

  const relationshipClientIds = useMemo(
    () => new Set(relationshipClients.map((candidate) => candidate.id)),
    [relationshipClients],
  );
  const relationshipCompanyNames = useMemo(
    () => new Set(relationshipClients.map((candidate) => candidate.companyName.toLowerCase())),
    [relationshipClients],
  );

  const clientProjects = useMemo(() => {
    if (!client) return [];
    return projectsForClientRelationship(ops.projects, client, ops.clients ?? []);
  }, [ops.projects, client, ops.clients]);

  const clientInvoices = useMemo(() => {
    if (!client) return [];
    return invoices.filter(
      (invoice) =>
        (invoice.clientId != null && relationshipClientIds.has(invoice.clientId)) ||
        relationshipCompanyNames.has(invoice.clientName.toLowerCase()),
    );
  }, [invoices, client, relationshipClientIds, relationshipCompanyNames]);

  const clientDocuments = useMemo(() => {
    if (!client) return [];
    return docs.agreements.filter(
      (agreement) =>
        (agreement.clientId != null && relationshipClientIds.has(agreement.clientId)) ||
        relationshipCompanyNames.has(agreement.counterpartyName.toLowerCase()),
    );
  }, [docs.agreements, client, relationshipClientIds, relationshipCompanyNames]);

  const projectGroups = useMemo(
    () =>
      relationshipClients
        .map((company) => ({
          company,
          projects: clientProjects.filter(
            (project) =>
              project.clientId === company.id ||
              project.client.toLowerCase() === company.companyName.toLowerCase(),
          ),
        }))
        .filter((group) => group.projects.length > 0),
    [relationshipClients, clientProjects],
  );

  // Project contracts are authoritative for received/outstanding after Ground Zero.
  const metrics = useMemo(() => {
    return clientProjects.reduce(
      (totals, project) => {
        const summary = paymentSummary(project);
        totals.totalRevenue += summary.received;
        totals.outstandingAmount += estimatedPending(project);
        return totals;
      },
      { totalRevenue: 0, outstandingAmount: 0 },
    );
  }, [clientProjects]);

  const activeProjects = useMemo(() => {
    return clientProjects.filter((p) => p.status === "active");
  }, [clientProjects]);

  const completedProjects = useMemo(() => {
    return clientProjects.filter((p) => p.status === "completed");
  }, [clientProjects]);

  const recentPayments = useMemo(() => {
    const list: Array<{
      id: string;
      amount: number;
      date: string;
      note?: string;
      projectTitle: string;
    }> = [];
    for (const proj of clientProjects) {
      if (proj.payments) {
        for (const p of proj.payments) {
          list.push({
            id: p.id,
            amount: p.amount,
            date: p.date,
            note: p.note,
            projectTitle: proj.client + (proj.projectType ? ` (${proj.projectType})` : ""),
          });
        }
      }
    }
    return list.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  }, [clientProjects]);

  const timelineLogs = useMemo(() => {
    if (!client) return [];
    return logs
      .filter((log) => {
        if (log.entityId && relationshipClientIds.has(log.entityId)) return true;
        if (
          [...relationshipCompanyNames].some((name) => log.summary.toLowerCase().includes(name))
        ) {
          return true;
        }
        const isProj =
          log.entity === "project" && clientProjects.some((p) => p.id === log.entityId);
        const isInv = log.entity === "invoice" && clientInvoices.some((i) => i.id === log.entityId);
        return isProj || isInv;
      })
      .slice(0, 10);
  }, [
    logs,
    client,
    clientProjects,
    clientInvoices,
    relationshipClientIds,
    relationshipCompanyNames,
  ]);

  if (opsLoading || invLoading || docsLoading || logsLoading) {
    return (
      <div className="flex h-48 items-center justify-center text-muted-foreground">
        Loading client details...
      </div>
    );
  }

  if (!client) {
    return (
      <div className="space-y-4">
        <div className="text-destructive">Client profile not found.</div>
        <Button variant="outline" onClick={() => router.history.back()}>
          Go back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          to="/clients"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 glass-card text-white/70 hover:border-white/25 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-black tracking-tight text-white md:text-3xl">{client.companyName}</h1>
            <span
              className={
                client.status === "active"
                  ? "inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold capitalize text-emerald-400"
                  : "inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs font-semibold capitalize text-white/60"
              }
            >
              {client.status}
            </span>
          </div>
          <p className="mt-1 text-xs text-white/50">
            Client Since {client.clientSince}
          </p>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-white/10 glass-panel p-5 transition-all duration-300 hover:border-rose-500/30">
          <div className="flex items-center justify-between text-white/60">
            <span className="text-xs font-bold uppercase tracking-wider text-white/50">
              Outstanding Amount
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-400">
              <DollarSign className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-black tabular-nums text-rose-400">
            {formatINRWhole(metrics.outstandingAmount)}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 glass-panel p-5 transition-all duration-300 hover:border-emerald-500/30">
          <div className="flex items-center justify-between text-white/60">
            <span className="text-xs font-bold uppercase tracking-wider text-white/50">Total Received</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
              <DollarSign className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-black tabular-nums text-emerald-400">
            {formatINRWhole(metrics.totalRevenue)}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 glass-panel p-5 transition-all duration-300 hover:border-[#ff6b2b]/30">
          <div className="flex items-center justify-between text-white/60">
            <span className="text-xs font-bold uppercase tracking-wider text-white/50">Active Projects</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#ff6b2b]/20 bg-[#ff6b2b]/10 text-[#ff6b2b]">
              <Briefcase className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-black tabular-nums text-white">{activeProjects.length}</p>
        </div>

        <div className="rounded-2xl border border-white/10 glass-panel p-5 transition-all duration-300 hover:border-white/20">
          <div className="flex items-center justify-between text-white/60">
            <span className="text-xs font-bold uppercase tracking-wider text-white/50">
              Completed Projects
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/50">
              <Briefcase className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-black tabular-nums text-white/70">
            {completedProjects.length}
          </p>
        </div>
      </div>

      {/* Profile and Projects Section */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {/* Active Projects */}
          <div className="rounded-2xl border border-white/10 glass-panel overflow-hidden">
            <div className="border-b border-white/10 px-5 py-4">
              <h3 className="font-bold text-white">Projects</h3>
              <p className="mt-0.5 text-xs text-white/50">
                Only ongoing and completed work is shown.
              </p>
            </div>
            <div className="divide-y divide-white/5">
              {projectGroups.length === 0 ? (
                <div className="px-5 py-8 text-center text-white/50 text-sm">
                  No ongoing or completed projects associated with this client.
                </div>
              ) : (
                projectGroups.map(({ company, projects }) => (
                  <div key={company.id} className="p-5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-bold text-white">
                          {company.companyName}
                        </h4>
                        {company.contactPerson && company.contactPerson !== company.companyName && (
                          <p className="text-xs text-white/50">
                            Contact: {company.contactPerson}
                          </p>
                        )}
                      </div>
                      {company.id !== client.id && (
                        <Link
                          to="/clients/$id"
                          params={{ id: company.id }}
                          className="text-xs font-semibold text-[#ff6b2b] hover:underline"
                        >
                          Project profile
                        </Link>
                      )}
                    </div>
                    <div className="space-y-2">
                      {projects.map((project) => (
                        <Link
                          key={project.id}
                          to="/projects/$id"
                          params={{ id: project.id }}
                          className="group flex items-center justify-between rounded-xl border border-white/5 glass-card px-4 py-3 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.04]"
                        >
                          <span className="text-sm font-medium text-white group-hover:text-white">
                            {project.projectType || "General Work"}
                          </span>
                          <span
                            className={
                              project.status === "active"
                                ? "inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400 capitalize"
                                : "inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-white/60 capitalize"
                            }
                          >
                            {project.status === "active" ? "Ongoing" : "Done"}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Invoices */}
          <div className="rounded-2xl border border-white/10 glass-panel overflow-hidden">
            <div className="border-b border-white/10 px-5 py-4">
              <h3 className="font-bold text-white">Invoices</h3>
            </div>
            <div className="divide-y divide-white/5">
              {clientInvoices.length === 0 ? (
                <div className="px-5 py-8 text-center text-white/50 text-sm">
                  No invoices issued.
                </div>
              ) : (
                clientInvoices.slice(0, 5).map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between px-5 py-3.5 transition-colors hover:bg-white/[0.02]"
                  >
                    <div>
                      <h4 className="font-semibold text-white text-sm">{inv.number}</h4>
                      <p className="mt-0.5 text-xs text-white/50">
                        Date: {inv.date} &bull; Total: {formatINR(computeTotals(inv).total)} &bull;{" "}
                        <span className="capitalize">{inv.status}</span>
                      </p>
                    </div>
                    <Link
                      to="/invoice/$id"
                      params={{ id: inv.id }}
                      className="text-xs text-[#ff6b2b] hover:underline font-semibold"
                    >
                      View Invoice
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Payments */}
          <div className="rounded-2xl border border-white/10 glass-panel overflow-hidden">
            <div className="border-b border-white/10 px-5 py-4">
              <h3 className="font-bold text-white">Recent Payments</h3>
            </div>
            <div className="divide-y divide-white/5">
              {recentPayments.length === 0 ? (
                <div className="px-5 py-8 text-center text-white/50 text-sm">
                  No payments logged yet.
                </div>
              ) : (
                recentPayments.map((pay) => (
                  <div key={pay.id} className="flex items-center justify-between px-5 py-3.5">
                    <div>
                      <h4 className="font-bold text-emerald-400 text-sm tabular-nums">
                        +{formatINR(pay.amount)}
                      </h4>
                      <p className="mt-0.5 text-xs text-white/50">
                        {pay.date} &bull; Project: {pay.projectTitle}
                      </p>
                    </div>
                    {pay.note && <span className="text-xs text-white/40">{pay.note}</span>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
          {/* Client Details */}
          <div className="rounded-2xl border border-white/10 glass-panel p-5 space-y-4 text-sm">
            <h3 className="font-bold border-b border-white/10 pb-3 text-white">
              Client Profile
            </h3>
            <div className="space-y-3.5">
              <div className="flex items-start gap-2.5">
                <Building className="mt-0.5 h-4 w-4 text-white/50 flex-shrink-0" />
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-white/40">Contact Person</div>
                  <div className="font-medium text-white">{client.contactPerson}</div>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Calendar className="mt-0.5 h-4 w-4 text-white/50 flex-shrink-0" />
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-white/40">Industry / Website</div>
                  <div className="text-white/80">{client.industry || "N/A"}</div>
                  {safeHref(client.website) && (
                    <a
                      href={safeHref(client.website)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#ff6b2b] hover:underline text-xs"
                    >
                      {client.website}
                    </a>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-white/40">Email</div>
                <div className="text-white/80 break-all">{client.email}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-white/40">Phone</div>
                <div className="text-white/80 font-mono text-xs">{client.phone}</div>
              </div>
              {client.gstNumber && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-white/40">GSTIN</div>
                  <div className="text-white/80 font-mono text-xs">{client.gstNumber}</div>
                </div>
              )}
              {client.pan && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-white/40">PAN</div>
                  <div className="text-white/80 font-mono text-xs">{client.pan}</div>
                </div>
              )}
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-white/40">Billing Address</div>
                <div className="text-white/70 whitespace-pre-line text-xs leading-relaxed mt-1">
                  {client.billingAddress}
                </div>
              </div>
            </div>
          </div>

          {/* Client Documents */}
          <div className="rounded-2xl border border-white/10 glass-panel p-5 space-y-3">
            <h3 className="font-bold border-b border-white/10 pb-3 text-white">Documents</h3>
            <div className="space-y-2">
              {clientDocuments.length === 0 ? (
                <div className="text-xs text-white/40 py-2">No documents uploaded.</div>
              ) : (
                clientDocuments.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-2 rounded-lg border border-white/5 glass-card px-3 py-2 text-xs">
                    <FileDigit className="h-4 w-4 text-white/50 flex-shrink-0" />
                    <span className="truncate text-white font-medium flex-1">{doc.title}</span>
                    <Link to="/documents" className="text-[#ff6b2b] hover:underline text-[11px] font-semibold">
                      Open
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Timeline / Activity */}
          <div className="rounded-2xl border border-white/10 glass-panel p-5 space-y-3">
            <h3 className="font-bold border-b border-white/10 pb-3 text-white">Timeline</h3>
            <div className="space-y-3">
              {timelineLogs.length === 0 ? (
                <div className="text-xs text-white/40 py-2">No activities recorded.</div>
              ) : (
                timelineLogs.map((log) => (
                  <div key={log.id} className="flex gap-2.5 text-xs">
                    <Activity className="mt-0.5 h-3.5 w-3.5 text-[#ff6b2b] flex-shrink-0" />
                    <div>
                      <div className="text-white/90 leading-snug">{log.summary}</div>
                      <div className="text-[10px] text-white/40 mt-0.5 font-mono">
                        {formatActivityTimestamp(log.timestamp)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
