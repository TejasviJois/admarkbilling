import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { logClientError } from "@/lib/client-logger";
import { readClientCache, writeClientCache } from "@/lib/client-data-cache";
import { loadCompany } from "@/lib/storage";
import { queryKeys } from "@/lib/query-keys";
import type { CompanySettings } from "@/lib/types";
import { DEFAULT_COMPANY } from "@/lib/constants";

const CACHE_KEY = "company";

export function useCompany() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.company,
    queryFn: loadCompany,
    placeholderData: () => readClientCache<CompanySettings>(CACHE_KEY) ?? DEFAULT_COMPANY,
  });

  useEffect(() => {
    if (query.data) writeClientCache(CACHE_KEY, query.data);
  }, [query.data]);

  const company = query.data ?? DEFAULT_COMPANY;
  const loading = query.isLoading && !query.data;

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.company }).catch((e) => {
      logClientError("useCompany.invalidate", e);
    });

  return { company, loading, isFetching: query.isFetching, invalidate };
}
