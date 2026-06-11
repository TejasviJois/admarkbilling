import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { logClientError } from "@/lib/client-logger";
import { readClientCache, writeClientCache } from "@/lib/client-data-cache";
import { DEFAULT_PROJECTS } from "@/lib/default-projects";
import { DEFAULT_PARTNERSHIPS } from "@/lib/default-partnerships";
import { diffOperationsChanges } from "@/lib/activity-log";
import { loadOperations, saveOperations } from "@/lib/operations-storage";
import { queryKeys } from "@/lib/query-keys";
import type { OperationsData } from "@/lib/types";

const EMPTY: OperationsData = { projects: [], partnerships: [], expenses: [], leads: [] };
const CACHE_KEY = "operations";

export function useOperations() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.operations,
    queryFn: loadOperations,
    placeholderData: () => readClientCache<OperationsData>(CACHE_KEY),
  });

  useEffect(() => {
    if (query.data) writeClientCache(CACHE_KEY, query.data);
  }, [query.data]);

  const ops = query.data ?? EMPTY;
  const loading = query.isLoading && !query.data;

  const persist = (next: OperationsData) => {
    const drafts = diffOperationsChanges(ops, next);
    if (drafts.length > 0) {
      void import("@/lib/activity-log-storage")
        .then((m) => m.appendActivityLogs(drafts))
        .catch((e) => logClientError("useOperations.activityLog", e));
    }
    queryClient.setQueryData(queryKeys.operations, next);
    writeClientCache(CACHE_KEY, next);
    void saveOperations(next).catch((e) => logClientError("useOperations.save", e));
  };

  return { ops, persist, loading, isFetching: query.isFetching };
}

export function fallbackOperations(): OperationsData {
  return {
    projects: DEFAULT_PROJECTS,
    partnerships: DEFAULT_PARTNERSHIPS,
    expenses: [],
  };
}
