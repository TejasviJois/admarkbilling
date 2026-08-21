import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { InvoicesLedger } from "@/components/documents/InvoicesLedger";
import { DocumentsBreadcrumb } from "@/components/documents/documents-ui";

export const Route = createFileRoute("/documents/invoices")({ component: DocumentsInvoicesPage });

function DocumentsInvoicesPage() {
  return (
    <div className="space-y-8">
      <DocumentsBreadcrumb
        items={[{ label: "Documents", to: "/documents" }, { label: "Invoices" }]}
      />
      <div>
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400">
            <FileText className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            Invoices
          </h1>
        </div>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Generated invoice downloads and payment archives. Create invoices from Finance.
        </p>
      </div>
      <InvoicesLedger emptyMessage="No invoices yet. Create one to see it listed here." />
    </div>
  );
}
