import { lazy, Suspense, type ComponentProps } from "react";
import { LoadingDog } from "@/components/ui/loading-dog";

const MonthlyIncomeExpenseChartInner = lazy(() =>
  import("@/components/analytics/MonthlyChart").then((m) => ({
    default: m.MonthlyIncomeExpenseChart,
  })),
);

export function LazyMonthlyChart(props: ComponentProps<typeof MonthlyIncomeExpenseChartInner>) {
  return (
    <Suspense fallback={<LoadingDog message="Loading chart…" />}>
      <MonthlyIncomeExpenseChartInner {...props} />
    </Suspense>
  );
}
