import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { logClientError } from "@/lib/client-logger";
import { readClientCache, writeClientCache } from "@/lib/client-data-cache";
import { loadInvoices } from "@/lib/storage";
import { queryKeys } from "@/lib/query-keys";
import type { Invoice } from "@/lib/types";

const CACHE_KEY = "invoices";

export function useInvoices() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.invoices,
    queryFn: loadInvoices,
    placeholderData: () => readClientCache<Invoice[]>(CACHE_KEY),
  });

  useEffect(() => {
    if (query.data) writeClientCache(CACHE_KEY, query.data);
  }, [query.data]);

  const invoices = query.data ?? [];
  const loading = query.isLoading && !query.data;

  const setInvoices = (next: Invoice[] | ((prev: Invoice[]) => Invoice[])) => {
    queryClient.setQueryData(queryKeys.invoices, (prev: Invoice[] | undefined) => {
      const base = prev ?? [];
      const updated = typeof next === "function" ? next(base) : next;
      writeClientCache(CACHE_KEY, updated);
      return updated;
    });
  };

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.invoices }).catch((e) => {
      logClientError("useInvoices.refresh", e);
    });

  return { invoices, loading, isFetching: query.isFetching, setInvoices, refresh };
}
