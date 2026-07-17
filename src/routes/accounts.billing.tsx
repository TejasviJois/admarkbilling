import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { BillingDetailsLedger } from "@/components/accounts/BillingDetailsLedger";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";

export const Route = createFileRoute("/accounts/billing")({ component: AccountsBillingPage });

function AccountsBillingPage() {
  const { ops, persist, loading } = useOperations();

  if (loading) return <OperationsLoading />;

  return (
    <div>
      <Link
        to="/accounts"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Accounts
      </Link>
      <OperationsPageHeader
        title="Billing details"
        description="Ongoing and done projects — search, review, and edit billing per client. In discussions, on hold, and not interested are excluded."
      />
      <section className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6">
        <BillingDetailsLedger ops={ops} persist={persist} />
      </section>
    </div>
  );
}
