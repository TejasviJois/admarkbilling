import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { loadCompany, loadInvoices } from "@/lib/storage";
import { prefetchAppData } from "@/lib/prefetch-app-data";

/** Warm everything the invoice editor needs — call on /new navigation or New-button hover. */
export function prefetchInvoiceEditor(queryClient: QueryClient): void {
  prefetchAppData(queryClient);
  void queryClient.prefetchQuery({ queryKey: queryKeys.company, queryFn: loadCompany });
  void queryClient.prefetchQuery({ queryKey: queryKeys.invoices, queryFn: loadInvoices });
}

/** Preload the /new route JS chunk (call from New links on pointer enter). */
export function preloadNewInvoiceRoute(): void {
  void import("@/components/invoice/InvoiceForm");
}
