import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Building2,
  FileSignature,
  FileText,
  FolderOpen,
  Users,
} from "lucide-react";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";
import { entitySlug } from "@/lib/document-slug";
import { projectClientLabel } from "@/lib/project-status";

export const Route = createFileRoute("/documents/")({ component: DocumentsHubPage });

function DocumentsHubPage() {
  const { ops, loading: opsLoading } = useOperations();

  if (opsLoading) return <OperationsLoading />;

  // Only ongoing (active) clients matter for day-to-day document work.
  const ongoingClients = [
    ...new Set(
      (ops.projects ?? [])
        .filter((p) => p.status === "active")
        .map((p) => projectClientLabel(p).trim())
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b));

  return (
    <div className="space-y-8">
      <OperationsPageHeader
        title="Documents"
        description="Unified file archive containing invoices, receipts, and agency agreements."
      />

      <section className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex items-start gap-3">
          <FolderOpen className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Quick access</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Jump straight into invoices, company files, or agreements.
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <QuickLink
            to="/documents/invoices"
            icon={<FileText className="h-4 w-4" />}
            label="Invoice archive"
          />
          <QuickLink
            to="/documents/company"
            icon={<Building2 className="h-4 w-4" />}
            label="Company documents"
          />
          <QuickLink
            to="/documents/agreements"
            icon={<FileSignature className="h-4 w-4" />}
            label="Agreements"
          />
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex items-start gap-3">
          <Users className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Client documents</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Payment records and files for each ongoing client.
            </p>
          </div>
        </div>
        {ongoingClients.length === 0 ? (
          <p className="text-sm text-muted-foreground">No ongoing clients right now.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ongoingClients.map((client) => (
              <Link
                key={client}
                to="/documents/payments/clients/$clientKey"
                params={{ clientKey: entitySlug(client) }}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2.5 text-sm font-medium hover:bg-secondary"
              >
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{client}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function QuickLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2.5 text-sm font-medium hover:bg-secondary"
    >
      {icon}
      {label}
    </Link>
  );
}
