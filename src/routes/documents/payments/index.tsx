import { createFileRoute } from "@tanstack/react-router";
import { Handshake, IndianRupee, Truck, Users } from "lucide-react";
import { DocumentHubCard, DocumentsBreadcrumb } from "@/components/documents/documents-ui";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";
import { summarizeClients, summarizePartners, summarizeVendors } from "@/lib/document-ledger";
import { formatINRWhole } from "@/lib/invoice-calc";

export const Route = createFileRoute("/documents/payments/")({ component: DocumentsPaymentsHub });

function DocumentsPaymentsHub() {
  const { ops, loading } = useOperations();
  if (loading) return <OperationsLoading />;

  const clients = summarizeClients(ops);
  const partners = summarizePartners(ops);
  const vendors = summarizeVendors(ops);
  const clientTotal = clients.reduce((s, c) => s + c.totalReceived, 0);
  const partnerTotal = partners.reduce((s, p) => s + p.totalPaid, 0);
  const vendorTotal = vendors.reduce((s, v) => s + v.totalPaid, 0);

  return (
    <div>
      <DocumentsBreadcrumb
        items={[{ label: "Documents", to: "/documents" }, { label: "Payments" }]}
      />
      <OperationsPageHeader
        title="Payment histories"
        description="Select a counterparty type, then open each client, partner, or vendor to see their full payment trail and proofs."
      />

      <div className="grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-3">
        <DocumentHubCard
          to="/documents/payments/clients"
          title="Clients"
          description="Revenue received — installments logged on projects, grouped by client name."
          stat={`${clients.length} clients · ${formatINRWhole(clientTotal)} received`}
          icon={<Users className="h-6 w-6" />}
        />
        <DocumentHubCard
          to="/documents/payments/partners"
          title="Partners"
          description="External payouts linked to a partnership record — affiliates, collaborators, and strategic partners."
          stat={`${partners.length} partners · ${formatINRWhole(partnerTotal)} paid`}
          icon={<Handshake className="h-6 w-6" />}
        />
        <DocumentHubCard
          to="/documents/payments/vendors"
          title="Vendors"
          description="External payouts not linked to a partner — grouped by vendor / merchant name on the expense."
          stat={`${vendors.length} vendors · ${formatINRWhole(vendorTotal)} paid`}
          icon={<Truck className="h-6 w-6" />}
        />
      </div>

      <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
        <IndianRupee className="h-3.5 w-3.5" />
        Payment data comes from Projects and Expenses. Add new entries there; this section is your
        read-only archive.
      </p>
    </div>
  );
}
