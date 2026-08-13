import type { QueryClient } from "@tanstack/react-query";
import { loadDocuments } from "@/lib/documents-storage";
import { loadCompany, loadInvoices } from "@/lib/storage";
import { loadOperations } from "@/lib/operations-storage";
import { queryKeys } from "@/lib/query-keys";

function deferIdle(work: () => void): void {
  if (typeof window === "undefined") {
    // SSR / server beforeLoad — still warm secondary data, just don't block
    // the critical path's event loop priority on the client.
    work();
    return;
  }
  const ric = (
    window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    }
  ).requestIdleCallback;
  if (typeof ric === "function") {
    ric(work, { timeout: 1500 });
    return;
  }
  window.setTimeout(work, 0);
}

/** Warm critical data after auth. Ops + company first; invoices/docs when idle. */
export function prefetchAppData(queryClient: QueryClient): void {
  void queryClient.prefetchQuery({ queryKey: queryKeys.operations, queryFn: loadOperations });
  void queryClient.prefetchQuery({ queryKey: queryKeys.company, queryFn: loadCompany });
  deferIdle(() => {
    void queryClient.prefetchQuery({ queryKey: queryKeys.invoices, queryFn: loadInvoices });
    void queryClient.prefetchQuery({ queryKey: queryKeys.documents, queryFn: loadDocuments });
  });
}
