import { createFileRoute, Link } from "@tanstack/react-router";
import { OutgoingPaymentHistoryTable } from "@/components/documents/PaymentHistoryTable";
import { DocumentsBreadcrumb } from "@/components/documents/documents-ui";
import {
  ContactLinks,
  OperationsLoading,
  OperationsPageHeader,
} from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";
import { partnerPaymentHistory } from "@/lib/document-ledger";
import { formatINRWhole } from "@/lib/invoice-calc";

export const Route = createFileRoute("/documents/payments/partners/$partnershipId")({
  component: DocumentsPartnerDetailPage,
});

function DocumentsPartnerDetailPage() {
  const { partnershipId } = Route.useParams();
  const { ops, persist, loading } = useOperations();

  if (loading) return <OperationsLoading />;

  const { partnership, rows, total } = partnerPaymentHistory(ops, partnershipId);

  if (!partnership) {
    return (
      <div>
        <DocumentsBreadcrumb
          items={[
            { label: "Documents", to: "/documents" },
            { label: "Payments", to: "/documents/payments" },
            { label: "Partners", to: "/documents/payments/partners" },
            { label: "Not found" },
          ]}
        />
        <p className="text-sm text-muted-foreground">Partner not found.</p>
        <Link
          to="/documents/payments/partners"
          className="mt-2 inline-block text-sm text-primary hover:underline"
        >
          Back to partners
        </Link>
      </div>
    );
  }

  return (
    <div>
      <DocumentsBreadcrumb
        items={[
          { label: "Documents", to: "/documents" },
          { label: "Payments", to: "/documents/payments" },
          { label: "Partners", to: "/documents/payments/partners" },
          { label: partnership.name },
        ]}
      />
      <OperationsPageHeader
        title={partnership.name}
        description={`External payout history — ${formatINRWhole(total)} paid across ${rows.length} entr${rows.length === 1 ? "y" : "ies"}.`}
      />

      {(partnership.phone || partnership.email || partnership.contact || partnership.type) && (
        <section className="mb-6 rounded-3xl border border-white/10 bg-[#141419]/80 p-5 shadow-xl backdrop-blur-2xl">
          <h2 className="text-base font-bold text-white">Partner details</h2>
          <dl className="mt-2 space-y-1 text-sm text-white/70">
            {partnership.type && (
              <div>
                <dt className="inline font-medium text-white">Type: </dt>
                <dd className="inline">{partnership.type}</dd>
              </div>
            )}
            {(partnership.phone || partnership.email || partnership.contact) && (
              <div>
                <dt className="mb-1 font-medium text-white">Contact</dt>
                <dd>
                  <ContactLinks
                    phone={partnership.phone}
                    email={partnership.email}
                    legacyContact={partnership.contact}
                  />
                </dd>
              </div>
            )}
            <div>
              <dt className="inline font-medium text-white">Status: </dt>
              <dd className="inline capitalize text-[#ff6b2b]">{partnership.status}</dd>
            </div>
          </dl>
          <Link
            to="/partnerships"
            className="mt-3 inline-block text-xs font-semibold text-[#ff6b2b] hover:underline"
          >
            Edit in Partnerships →
          </Link>
        </section>
      )}

      <section className="rounded-3xl border border-white/10 bg-[#141419]/80 p-5 shadow-xl backdrop-blur-2xl sm:p-6">
        <h2 className="mb-4 text-base font-bold text-white">Payout history</h2>
        <OutgoingPaymentHistoryTable rows={rows} ops={ops} persist={persist} />
      </section>
    </div>
  );
}
