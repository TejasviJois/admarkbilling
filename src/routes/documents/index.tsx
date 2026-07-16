import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Building2,
  FileSignature,
  FileText,
  FolderOpen,
  Handshake,
  Truck,
  Users,
} from "lucide-react";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";

export const Route = createFileRoute("/documents/")({ component: DocumentsHubPage });

function DocumentsHubPage() {
  const { loading: opsLoading } = useOperations();

  if (opsLoading) return <OperationsLoading />;

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
              Jump straight into invoices, payment categories, company files, or agreements.
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <QuickLink to="/documents/invoices" icon={<FileText className="h-4 w-4" />} label="All invoices" />
          <QuickLink to="/documents/payments/clients" icon={<Users className="h-4 w-4" />} label="All clients" />
          <QuickLink
            to="/documents/payments/partners"
            icon={<Handshake className="h-4 w-4" />}
            label="All partners"
          />
          <QuickLink to="/documents/payments/vendors" icon={<Truck className="h-4 w-4" />} label="All vendors" />
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
