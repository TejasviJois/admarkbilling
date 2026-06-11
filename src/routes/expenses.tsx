import { createFileRoute } from "@tanstack/react-router";
import { ExpensesSection } from "@/components/operations/ExpensesSection";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";

export const Route = createFileRoute("/expenses")({ component: ExpensesPage });

function ExpensesPage() {
  const { ops, persist, loading } = useOperations();

  if (loading) return <OperationsLoading />;

  return (
    <div>
      <OperationsPageHeader
        title="Expenses"
        description="Historical baseline from bank records plus new payouts — proof required for new entries."
      />
      <ExpensesSection ops={ops} persist={persist} />
    </div>
  );
}
