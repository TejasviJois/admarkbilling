import { createFileRoute } from '@tanstack/react-router'
import { NewInvoiceLink } from "@/components/invoice/NewInvoiceLink";
import { Plus } from "lucide-react";
import { InvoicesLedger } from "@/components/documents/InvoicesLedger";
import { DocumentsBreadcrumb } from "@/components/documents/documents-ui";
import { OperationsPageHeader } from "@/components/operations/operations-ui";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/documents/invoices")({ component: DocumentsInvoicesPage });

function DocumentsInvoicesPage() {
  return (
    <div>
      <DocumentsBreadcrumb
        items={[
          { label: "Documents", to: "/documents" },
          { label: "Invoices" },
        ]}
      />
      <OperationsPageHeader
        title="Invoices"
        description="Every generated invoice is stored here — view, download PDF, or open the full record."
        action={
          <Button asChild size="sm">
            <NewInvoiceLink>
              <Plus className="h-4 w-4" />
              New invoice
            </NewInvoiceLink>
          </Button>
        }
      />
      <InvoicesLedger emptyMessage="No invoices yet. Create one to see it listed here." />
    </div>
  );
}
