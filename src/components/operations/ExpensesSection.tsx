import { useMemo, useState } from "react";
import { Wallet } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EXPENSE_CATEGORY_LABELS, expenseCategoryLabel, normalizeCategory } from "@/lib/financial";
import { isWithinPeriod, DEFAULT_PERIOD, type PeriodKey } from "@/lib/date-range-filter";
import type { ExpenseCategory, OperationsData } from "@/lib/types";
import { SearchWithPeriodFilter } from "@/components/operations/SearchWithPeriodFilter";
import { DataSection, EmptyRow, Field } from "./operations-ui";
import { ExpensesTable } from "./ExpensesTable";

const FILTER_CATEGORIES: ExpenseCategory[] = [
  "company",
  "founder_payout",
  "external_payout",
  "handout",
];

export function ExpensesSection({
  ops,
  persist,
  open,
  onOpenChange,
}: {
  ops: OperationsData;
  persist: (next: OperationsData) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<PeriodKey>(DEFAULT_PERIOD);
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | "all">("all");

  const loggedExpenses = useMemo(
    () =>
      [...ops.expenses.filter((e) => !e.isBaseline)].sort((a, b) =>
        b.date.localeCompare(a.date),
      ),
    [ops.expenses],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return loggedExpenses.filter((e) => {
      const cat = normalizeCategory(e.category);
      if (categoryFilter !== "all" && cat !== categoryFilter) return false;
      if (!isWithinPeriod(e.date, period)) return false;
      if (!q) return true;
      const partner =
        e.partnershipId && ops.partnerships.find((p) => p.id === e.partnershipId)?.name;
      const haystack = [e.label, expenseCategoryLabel(e.category), e.date, partner, e.notes]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [loggedExpenses, search, period, categoryFilter, ops.partnerships]);

  const removeExpense = (id: string) => {
    persist({ ...ops, expenses: ops.expenses.filter((e) => e.id !== id) });
  };

  return (
    <DataSection
      collapsible
      defaultOpen={false}
      open={open}
      onOpenChange={onOpenChange}
      title="Expense ledger"
      description="Logged payouts after the historical baseline — each entry requires proof."
      icon={<Wallet className="h-5 w-5 text-primary" strokeWidth={2} />}
    >
      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <SearchWithPeriodFilter
          id="exp-search"
          search={search}
          onSearchChange={setSearch}
          period={period}
          onPeriodChange={setPeriod}
          placeholder="Description, category, date…"
        />
        <Field label="Category" id="exp-filter-category">
          <Select
            value={categoryFilter}
            onValueChange={(v) => setCategoryFilter(v as ExpenseCategory | "all")}
          >
            <SelectTrigger id="exp-filter-category">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {FILTER_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {EXPENSE_CATEGORY_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {loggedExpenses.length === 0 ? (
        <EmptyRow message="No expenses logged yet. Tap + to add one with proof." />
      ) : filtered.length === 0 ? (
        <EmptyRow message="No expenses match your search." />
      ) : (
        <ExpensesTable
          expenses={filtered}
          partnerships={ops.partnerships}
          ops={ops}
          persist={persist}
          onRemove={removeExpense}
        />
      )}
    </DataSection>
  );
}
