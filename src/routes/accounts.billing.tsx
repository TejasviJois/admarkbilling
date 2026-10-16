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
        className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white transition-all active:scale-[0.98]"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Accounts
      </Link>
      <OperationsPageHeader
        title="Billing details"
        description="Ongoing and done projects — search, review, and edit billing per client. In discussions, on hold, and not interested are excluded."
      />
      <section className="mt-6 rounded-3xl border border-white/10 bg-[#141419]/80 p-5 shadow-xl backdrop-blur-2xl sm:p-6">
        <BillingDetailsLedger ops={ops} persist={persist} />
      </section>
    </div>
  );
}
