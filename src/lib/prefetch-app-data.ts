import type { QueryClient } from "@tanstack/react-query";
import { loadDocuments } from "@/lib/documents-storage";
import { loadCompany, loadInvoices } from "@/lib/storage";
import { loadOperations } from "@/lib/operations-storage";
import { queryKeys } from "@/lib/query-keys";

/** Warm critical data after login so navigation feels instant. */
export function prefetchAppData(queryClient: QueryClient): void {
  void queryClient.prefetchQuery({ queryKey: queryKeys.operations, queryFn: loadOperations });
  void queryClient.prefetchQuery({ queryKey: queryKeys.invoices, queryFn: loadInvoices });
  void queryClient.prefetchQuery({ queryKey: queryKeys.documents, queryFn: loadDocuments });
  void queryClient.prefetchQuery({ queryKey: queryKeys.company, queryFn: loadCompany });
}
