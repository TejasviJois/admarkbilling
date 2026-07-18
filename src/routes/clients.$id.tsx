import { useEffect, useState, useMemo } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Briefcase, FileText, Calendar, Building, DollarSign, Activity, FileDigit } from "lucide-react";
import { useOperations } from "@/hooks/use-operations";
import { useInvoices } from "@/hooks/use-invoices";
import { useDocuments } from "@/hooks/use-documents";
import { loadActivityLogs } from "@/lib/activity-log-storage";
import { computeTotals, formatINR, formatINRWhole } from "@/lib/invoice-calc";
import { formatActivityTimestamp } from "@/lib/activity-log-labels";
import { isRevenueProject } from "@/lib/project-status";
import { estimatedPending, paymentSummary } from "@/lib/project-payments";
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
    const allClients = ops.clients ?? [];
    const children = allClients.filter((candidate) => candidate.parentClientId === client.id);
    return children.length > 0 ? [client, ...children] : [client];
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
    return ops.projects.filter(
      (project) =>
        isRevenueProject(project.status) &&
        ((project.clientId != null && relationshipClientIds.has(project.clientId)) ||
          relationshipCompanyNames.has(project.client.toLowerCase())),
    );
  }, [ops.projects, client, relationshipClientIds, relationshipCompanyNames]);

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
    const list: Array<{ id: string; amount: number; date: string; note?: string; projectTitle: string }> = [];
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
          [...relationshipCompanyNames].some((name) =>
            log.summary.toLowerCase().includes(name),
          )
        ) {
          return true;
        }
        const isProj = log.entity === "project" && clientProjects.some((p) => p.id === log.entityId);
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
      <div className="flex items-center gap-3">
        <Link
          to="/clients"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-card text-muted-foreground hover:bg-secondary"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{client.companyName}</h1>
          <p className="text-sm text-muted-foreground">
            Client Since {client.clientSince} &bull; <span className="capitalize">{client.status}</span>
          </p>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Outstanding Amount</span>
            <DollarSign className="h-4 w-4 text-destructive" />
          </div>
          <p className="mt-2 text-2xl font-bold text-destructive">
            {formatINRWhole(metrics.outstandingAmount)}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Received</span>
            <DollarSign className="h-4 w-4 text-green-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-green-500">
            {formatINRWhole(metrics.totalRevenue)}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Projects</span>
            <Briefcase className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">
            {activeProjects.length}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Completed Projects</span>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-2 text-2xl font-bold text-muted-foreground">
            {completedProjects.length}
          </p>
        </div>
      </div>

      {/* Profile and Projects Section */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {/* Active Projects */}
          <div className="rounded-lg border border-border bg-card shadow-sm">
            <div className="border-b border-border px-4 py-3">
              <h3 className="font-semibold text-foreground">Projects</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Only ongoing and completed work is shown.
              </p>
            </div>
            <div className="divide-y divide-border">
              {projectGroups.length === 0 ? (
                <div className="px-4 py-6 text-center text-muted-foreground text-sm">
                  No ongoing or completed projects associated with this client.
                </div>
              ) : (
                projectGroups.map(({ company, projects }) => (
                  <div key={company.id} className="p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-semibold text-foreground">
                          {company.companyName}
                        </h4>
                        {company.contactPerson && company.contactPerson !== company.companyName && (
                          <p className="text-xs text-muted-foreground">
                            Contact: {company.contactPerson}
                          </p>
                        )}
                      </div>
                      {company.id !== client.id && (
                        <Link
                          to="/clients/$id"
                          params={{ id: company.id }}
                          className="text-xs font-semibold text-primary hover:underline"
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
                          className="flex items-center justify-between rounded-md border border-border/70 bg-muted/10 px-3 py-2.5 hover:bg-muted/30"
                        >
                          <span className="text-sm font-medium text-foreground">
                            {project.projectType || "General Work"}
                          </span>
                          <span className="text-xs capitalize text-muted-foreground">
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
          <div className="rounded-lg border border-border bg-card shadow-sm">
            <div className="border-b border-border px-4 py-3">
              <h3 className="font-semibold text-foreground">Invoices</h3>
            </div>
            <div className="divide-y divide-border">
              {clientInvoices.length === 0 ? (
                <div className="px-4 py-6 text-center text-muted-foreground text-sm">
                  No invoices issued.
                </div>
              ) : (
                clientInvoices.slice(0, 5).map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/10">
                    <div>
                      <h4 className="font-medium text-foreground text-sm">{inv.number}</h4>
                      <p className="text-xs text-muted-foreground">
                        Date: {inv.date} &bull; Total: {formatINR(computeTotals(inv).total)} &bull; Status:{" "}
                        <span className="capitalize">{inv.status}</span>
                      </p>
                    </div>
                    <Link
                      to="/invoice/$id"
                      params={{ id: inv.id }}
                      className="text-xs text-primary hover:underline font-semibold"
                    >
                      View Invoice
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Payments */}
          <div className="rounded-lg border border-border bg-card shadow-sm">
            <div className="border-b border-border px-4 py-3">
              <h3 className="font-semibold text-foreground">Recent Payments</h3>
            </div>
            <div className="divide-y divide-border">
              {recentPayments.length === 0 ? (
                <div className="px-4 py-6 text-center text-muted-foreground text-sm">
                  No payments logged yet.
                </div>
              ) : (
                recentPayments.map((pay) => (
                  <div key={pay.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <h4 className="font-medium text-green-500 text-sm">
                        +{formatINR(pay.amount)}
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        {pay.date} &bull; Project: {pay.projectTitle}
                      </p>
                    </div>
                    {pay.note && <span className="text-xs text-muted-foreground">{pay.note}</span>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
          {/* Client Details */}
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm space-y-4 text-sm">
            <h3 className="font-semibold border-b border-border pb-2 text-foreground">Client Profile</h3>
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <Building className="mt-0.5 h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div>
                  <div className="font-medium text-foreground">Contact Person</div>
                  <div className="text-muted-foreground">{client.contactPerson}</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Calendar className="mt-0.5 h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div>
                  <div className="font-medium text-foreground">Industry / Website</div>
                  <div className="text-muted-foreground">{client.industry || "N/A"}</div>
                  {client.website && (
                    <a
                      href={client.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline text-xs"
                    >
                      {client.website}
                    </a>
                  )}
                </div>
              </div>
              <div>
                <div className="font-medium text-foreground">Email</div>
                <div className="text-muted-foreground break-all">{client.email}</div>
              </div>
              <div>
                <div className="font-medium text-foreground">Phone</div>
                <div className="text-muted-foreground">{client.phone}</div>
              </div>
              {client.gstNumber && (
                <div>
                  <div className="font-medium text-foreground">GSTIN</div>
                  <div className="text-muted-foreground">{client.gstNumber}</div>
                </div>
              )}
              {client.pan && (
                <div>
                  <div className="font-medium text-foreground">PAN</div>
                  <div className="text-muted-foreground">{client.pan}</div>
                </div>
              )}
              <div>
                <div className="font-medium text-foreground">Billing Address</div>
                <div className="text-muted-foreground whitespace-pre-line leading-normal">
                  {client.billingAddress}
                </div>
              </div>
            </div>
          </div>

          {/* Client Documents */}
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm space-y-3">
            <h3 className="font-semibold border-b border-border pb-2 text-foreground">Documents</h3>
            <div className="space-y-2">
              {clientDocuments.length === 0 ? (
                <div className="text-xs text-muted-foreground">No documents uploaded.</div>
              ) : (
                clientDocuments.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-2 text-xs">
                    <FileDigit className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="truncate text-foreground font-medium flex-1">{doc.title}</span>
                    <Link
                      to="/documents"
                      className="text-primary hover:underline text-[10px]"
                    >
                      Open Vault
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Timeline / Activity */}
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm space-y-3">
            <h3 className="font-semibold border-b border-border pb-2 text-foreground">Timeline</h3>
            <div className="space-y-3">
              {timelineLogs.length === 0 ? (
                <div className="text-xs text-muted-foreground">No activities recorded.</div>
              ) : (
                timelineLogs.map((log) => (
                  <div key={log.id} className="flex gap-2 text-xs">
                    <Activity className="mt-0.5 h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <div>
                      <div className="text-foreground">{log.summary}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
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
