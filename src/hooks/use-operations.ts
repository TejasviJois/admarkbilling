import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { logClientError } from "@/lib/client-logger";
import { readClientCache, writeClientCache } from "@/lib/client-data-cache";
import { DEFAULT_PROJECTS } from "@/lib/default-projects";
import { DEFAULT_PARTNERSHIPS } from "@/lib/default-partnerships";
import { diffOperationsChanges } from "@/lib/activity-log";
import { OperationsConflictError, loadOperations, saveOperations } from "@/lib/operations-storage";
import {
  applyOperationsMutation,
  buildOperationsMutation,
  isOperationsMutationEmpty,
  UnsafeOperationsDeleteError,
  type OperationsPersistOptions,
} from "@/lib/operations-mutations";
import { queryKeys } from "@/lib/query-keys";
import type { OperationsData } from "@/lib/types";

const EMPTY: OperationsData = { projects: [], partnerships: [], expenses: [], leads: [] };
const CACHE_KEY = "operations";

export function useOperations() {
  const queryClient = useQueryClient();
  // Serialize persist calls so rapid double-clicks / multi-field saves always
  // diff against the latest optimistic cache, never a stale render snapshot.
  const persistChain = useRef<Promise<void>>(Promise.resolve());

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
  // True only after the first real load — placeholder cache data renders the UI
  // instantly but must not drive automatic background saves.
  const ready = query.data != null && !query.isPlaceholderData;

  const persist = (next: OperationsData, options: OperationsPersistOptions = {}): Promise<void> => {
    const run = async () => {
      const previous = queryClient.getQueryData<OperationsData>(queryKeys.operations) ?? ops;
      let mutation;
      try {
        mutation = buildOperationsMutation(previous, next, options);
      } catch (error) {
        if (error instanceof UnsafeOperationsDeleteError) {
          toast.error("Unsafe deletion blocked", {
            description:
              "The save tried to remove records without an explicit user action. Reloading current data.",
          });
          await queryClient.invalidateQueries({ queryKey: queryKeys.operations });
          return;
        }
        throw error;
      }
      if (isOperationsMutationEmpty(mutation)) return;
      const drafts = diffOperationsChanges(previous, next);
      queryClient.setQueryData(queryKeys.operations, next);
      writeClientCache(CACHE_KEY, next);
      try {
        const saved = await saveOperations(next, mutation, undefined, options);
        queryClient.setQueryData(queryKeys.operations, saved);
        writeClientCache(CACHE_KEY, saved);
        if (drafts.length > 0) {
          void import("@/lib/activity-log-storage")
            .then((m) => m.appendActivityLogs(drafts))
            .catch((e) => logClientError("useOperations.activityLog", e));
        }
      } catch (error) {
        if (!(error instanceof OperationsConflictError)) {
          logClientError("useOperations.save", error);
          toast.error("Could not save changes", {
            description: error instanceof Error ? error.message : "Please try again.",
          });
          await queryClient.invalidateQueries({ queryKey: queryKeys.operations });
          return;
        }

        const latest = error.latest;
        queryClient.setQueryData(queryKeys.operations, latest);
        writeClientCache(CACHE_KEY, latest);

        toast.error("Newer data exists on the server", {
          description:
            "Your stale save was rejected. Reload the server version or explicitly merge your change.",
          action: {
            label: "Merge change",
            onClick: () => {
              const merged = applyOperationsMutation(latest, error.mutation);
              queryClient.setQueryData(queryKeys.operations, merged);
              writeClientCache(CACHE_KEY, merged);
              void saveOperations(merged, error.mutation, error.version, {
                deleteIds: error.mutation.deletes,
              })
                .then((saved) => {
                  queryClient.setQueryData(queryKeys.operations, saved);
                  writeClientCache(CACHE_KEY, saved);
                  toast.success("Changes merged safely");
                })
                .catch((mergeError) => {
                  logClientError("useOperations.merge", mergeError);
                  toast.error("Merge needs review", {
                    description:
                      "The server changed again. Reload the page and review the latest data.",
                  });
                  void queryClient.invalidateQueries({ queryKey: queryKeys.operations });
                });
            },
          },
          cancel: {
            label: "Reload",
            onClick: () => {
              void queryClient.invalidateQueries({ queryKey: queryKeys.operations });
            },
          },
          duration: 15_000,
        });
      }
    };

    const queued = persistChain.current.then(run, run);
    persistChain.current = queued.catch(() => undefined);
    return queued;
  };

  return { ops, persist, loading, ready, isFetching: query.isFetching };
}

export function fallbackOperations(): OperationsData {
  return {
    projects: DEFAULT_PROJECTS,
    partnerships: DEFAULT_PARTNERSHIPS,
    expenses: [],
  };
}
