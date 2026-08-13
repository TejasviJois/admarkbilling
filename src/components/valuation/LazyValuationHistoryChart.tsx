import { lazy, Suspense, type ComponentProps } from "react";
import { LoadingDog } from "@/components/ui/loading-dog";

const ValuationHistoryChartInner = lazy(() =>
  import("@/components/valuation/ValuationHistoryChart").then((m) => ({
    default: m.ValuationHistoryChart,
  })),
);

export function LazyValuationHistoryChart(
  props: ComponentProps<typeof ValuationHistoryChartInner>,
) {
  return (
    <Suspense fallback={<LoadingDog message="Loading chart…" />}>
      <ValuationHistoryChartInner {...props} />
    </Suspense>
  );
}
