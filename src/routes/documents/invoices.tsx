import { createFileRoute } from "@tanstack/react-router";
import { InvoicesLedger } from "@/components/documents/InvoicesLedger";
import { DocumentsBreadcrumb } from "@/components/documents/documents-ui";
import { OperationsPageHeader } from "@/components/operations/operations-ui";

export const Route = createFileRoute("/documents/invoices")({ component: DocumentsInvoicesPage });

function DocumentsInvoicesPage() {
  return (
    <div>
      <DocumentsBreadcrumb
        items={[{ label: "Documents", to: "/documents" }, { label: "Invoices" }]}
      />
      <OperationsPageHeader
        title="Invoice Archive"
        description="Find, view, and download generated invoices. Create and manage invoices from Finance."
      />
      <InvoicesLedger emptyMessage="No invoices yet. Create one to see it listed here." />
    </div>
  );
}
