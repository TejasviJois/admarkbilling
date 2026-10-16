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
  isOperationsMutationEmpty,
  rebaseOperationsPersist,
  UnsafeOperationsDeleteError,
  type OperationsPersistOptions,
} from "@/lib/operations-mutations";
import { queryKeys } from "@/lib/query-keys";
import type { OperationsData } from "@/lib/types";

const EMPTY: OperationsData = {
  projects: [],
  partnerships: [],
  expenses: [],
  leads: [],
  assets: [],
  fixedMonthlyExpenses: [],
  clients: [],
  contacts: undefined,
  leadList: [],
  credentials: [],
  payments: [],
  transactions: [],
  founders: [],
  projectCommissions: [],
  notifications: [],
  scheduleEvents: [],
  valuationSnapshots: [],
  valuationAudit: [],
};
const CACHE_KEY = "operations";

function normalizeOperationsData(data: OperationsData | undefined | null): OperationsData {
  const base = data ?? EMPTY;
  return {
    ...EMPTY,
    ...base,
    projects: Array.isArray(base.projects) ? base.projects : [],
    partnerships: Array.isArray(base.partnerships) ? base.partnerships : [],
    expenses: Array.isArray(base.expenses) ? base.expenses : [],
    leads: Array.isArray(base.leads) ? base.leads : [],
    assets: Array.isArray(base.assets) ? base.assets : [],
    fixedMonthlyExpenses: Array.isArray(base.fixedMonthlyExpenses)
      ? base.fixedMonthlyExpenses
      : [],
    clients: Array.isArray(base.clients) ? base.clients : [],
    contacts: Array.isArray(base.contacts) ? base.contacts : undefined,
    leadList: Array.isArray(base.leadList) ? base.leadList : [],
    credentials: Array.isArray(base.credentials) ? base.credentials : [],
    payments: Array.isArray(base.payments) ? base.payments : [],
    transactions: Array.isArray(base.transactions) ? base.transactions : [],
    founders: Array.isArray(base.founders) ? base.founders : [],
    projectCommissions: Array.isArray(base.projectCommissions) ? base.projectCommissions : [],
    notifications: Array.isArray(base.notifications) ? base.notifications : [],
    scheduleEvents: Array.isArray(base.scheduleEvents) ? base.scheduleEvents : [],
    valuationSnapshots: Array.isArray(base.valuationSnapshots) ? base.valuationSnapshots : [],
    valuationAudit: Array.isArray(base.valuationAudit) ? base.valuationAudit : [],
  };
}

export type OperationsPersistInput =
  | OperationsData
  | ((current: OperationsData) => OperationsData);

export function useOperations() {
  const queryClient = useQueryClient();
  // Serialize persist calls so rapid double-clicks / multi-field saves always
  // rebase against the latest optimistic cache, never overwrite with a stale aggregate.
  const persistChain = useRef<Promise<void>>(Promise.resolve());

  const query = useQuery({
    queryKey: queryKeys.operations,
    queryFn: loadOperations,
    placeholderData: () => readClientCache<OperationsData>(CACHE_KEY),
  });

  useEffect(() => {
    if (query.data) writeClientCache(CACHE_KEY, normalizeOperationsData(query.data));
  }, [query.data]);

  useEffect(() => {
    if (!query.error) return;
    logClientError("useOperations.load", query.error);
  }, [query.error]);

  const ops = normalizeOperationsData(query.data);
  const loading = query.isLoading && !query.data && !query.isError;
  // True only after the first real load — placeholder cache data renders the UI
  // instantly but must not drive automatic background saves.
  const ready = query.data != null && !query.isPlaceholderData;

  const persist = (
    input: OperationsPersistInput,
    options: OperationsPersistOptions = {},
  ): Promise<void> => {
    // Capture the same render snapshot callers typically spread into `next`.
    // Intent is diffed against this base; the queued run applies that delta to
    // whatever is latest in the React Query cache.
    const callerBase = ops;

    const run = async () => {
      const previous = queryClient.getQueryData<OperationsData>(queryKeys.operations) ?? ops;
      let mutation;
      let next: OperationsData;
      try {
        if (typeof input === "function") {
          next = input(previous);
          const rebased = rebaseOperationsPersist(previous, next, previous, options);
          mutation = rebased.mutation;
          next = rebased.next;
        } else {
          const rebased = rebaseOperationsPersist(callerBase, input, previous, options);
          mutation = rebased.mutation;
          next = rebased.next;
        }
      } catch (error) {
        if (error instanceof UnsafeOperationsDeleteError) {
          toast.error("Unsafe deletion blocked", {
            description:
              "The save tried to remove records without an explicit user action. Reloading current data.",
          });
          await queryClient.invalidateQueries({ queryKey: queryKeys.operations });
          return;
        }
        logClientError("useOperations.persistBuild", error);
        toast.error("Could not save changes", {
          description: error instanceof Error ? error.message : "Please try again.",
        });
        await queryClient.invalidateQueries({ queryKey: queryKeys.operations });
        return;
      }
      if (isOperationsMutationEmpty(mutation)) return;
      const drafts = diffOperationsChanges(previous, next);
      queryClient.setQueryData(queryKeys.operations, next);
      writeClientCache(CACHE_KEY, next);
      const saveOptions: OperationsPersistOptions = {
        ...options,
        deleteIds: mutation.deletes,
      };
      try {
        const saved = await saveOperations(next, mutation, undefined, saveOptions);
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

        // Most CRM/calendar clicks race a background bump — auto-merge once
        // onto the server snapshot instead of blocking every subsequent action.
        try {
          const merged = applyOperationsMutation(latest, error.mutation);
          const saved = await saveOperations(merged, error.mutation, error.version, {
            deleteIds: error.mutation.deletes,
          });
          queryClient.setQueryData(queryKeys.operations, saved);
          writeClientCache(CACHE_KEY, saved);
          return;
        } catch (mergeError) {
          if (!(mergeError instanceof OperationsConflictError)) {
            logClientError("useOperations.autoMerge", mergeError);
            toast.error("Could not save changes", {
              description: mergeError instanceof Error ? mergeError.message : "Please try again.",
            });
            await queryClient.invalidateQueries({ queryKey: queryKeys.operations });
            return;
          }

          queryClient.setQueryData(queryKeys.operations, mergeError.latest);
          writeClientCache(CACHE_KEY, mergeError.latest);

          toast.error("Newer data exists on the server", {
            description:
              "Your stale save was rejected. Reload the server version or explicitly merge your change.",
            action: {
              label: "Merge change",
              onClick: () => {
                const merged = applyOperationsMutation(mergeError.latest, mergeError.mutation);
                queryClient.setQueryData(queryKeys.operations, merged);
                writeClientCache(CACHE_KEY, merged);
                void saveOperations(merged, mergeError.mutation, mergeError.version, {
                  deleteIds: mergeError.mutation.deletes,
                })
                  .then((saved) => {
                    queryClient.setQueryData(queryKeys.operations, saved);
                    writeClientCache(CACHE_KEY, saved);
                    toast.success("Changes merged safely");
                  })
                  .catch((retryError) => {
                    logClientError("useOperations.merge", retryError);
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
