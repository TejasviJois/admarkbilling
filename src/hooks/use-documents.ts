import { useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Agreement, DocumentsData } from "@/lib/types";
import {
  DocumentsConflictError,
  applyDocumentsMutation,
  loadDocuments,
  rebaseDocumentsPersist,
  saveDocuments,
  type DocumentsPersistOptions,
} from "@/lib/documents-storage";
import { logClientError } from "@/lib/client-logger";
import { readClientCache, writeClientCache } from "@/lib/client-data-cache";
import { queryKeys } from "@/lib/query-keys";

const CACHE_KEY = "documents";
const EMPTY: DocumentsData = { agreements: [], archiveDocuments: [] };

export function useDocuments() {
  const queryClient = useQueryClient();
  const persistChain = useRef<Promise<void>>(Promise.resolve());

  const query = useQuery({
    queryKey: queryKeys.documents,
    queryFn: loadDocuments,
    placeholderData: () => readClientCache<DocumentsData>(CACHE_KEY),
  });

  useEffect(() => {
    if (query.data) writeClientCache(CACHE_KEY, query.data);
  }, [query.data]);

  const docs = query.data ?? EMPTY;
  const loading = query.isLoading && !query.data;

  const saveMutation = useMutation({
    mutationFn: ({ next, options }: { next: DocumentsData; options: DocumentsPersistOptions }) =>
      saveDocuments(next, options),
  });

  const persist = useCallback(
    (
      input: DocumentsData | ((current: DocumentsData) => DocumentsData),
      options: DocumentsPersistOptions = {},
    ): Promise<void> => {
      const callerBase = docs;
      const run = async () => {
        const previous =
          queryClient.getQueryData<DocumentsData>(queryKeys.documents) ?? docs;
        let next: DocumentsData;
        let deleteIds: DocumentsPersistOptions["deleteIds"];
        try {
          if (typeof input === "function") {
            const intended = input(previous);
            const rebased = rebaseDocumentsPersist(previous, intended, previous, options);
            next = rebased.next;
            deleteIds = {
              ...options.deleteIds,
              ...rebased.mutation.deletes,
            };
          } else {
            const rebased = rebaseDocumentsPersist(callerBase, input, previous, options);
            next = rebased.next;
            deleteIds = {
              ...options.deleteIds,
              ...rebased.mutation.deletes,
            };
          }
        } catch (error) {
          toast.error("Unsafe deletion blocked", {
            description:
              error instanceof Error
                ? error.message
                : "Reload current documents and try again.",
          });
          await queryClient.invalidateQueries({ queryKey: queryKeys.documents });
          return;
        }

        const saveOptions: DocumentsPersistOptions = {
          ...options,
          deleteIds,
        };
        queryClient.setQueryData(queryKeys.documents, next);
        writeClientCache(CACHE_KEY, next);
        try {
          const saved = await saveMutation.mutateAsync({ next, options: saveOptions });
          queryClient.setQueryData(queryKeys.documents, saved);
          writeClientCache(CACHE_KEY, saved);
        } catch (e) {
          if (e instanceof DocumentsConflictError) {
            queryClient.setQueryData(queryKeys.documents, e.latest);
            writeClientCache(CACHE_KEY, e.latest);
            toast.error("Newer documents exist on the server", {
              description: "Your stale save was rejected. Reload or merge your document change.",
              action: {
                label: "Merge change",
                onClick: () => {
                  const merged = applyDocumentsMutation(e.latest, e.mutation);
                  void saveDocuments(merged, { deleteIds: e.mutation.deletes }, e.version)
                    .then((saved) => {
                      queryClient.setQueryData(queryKeys.documents, saved);
                      writeClientCache(CACHE_KEY, saved);
                      toast.success("Documents merged safely");
                    })
                    .catch((error) => {
                      logClientError("useDocuments.merge", error);
                      toast.error("Document merge needs review");
                      void queryClient.invalidateQueries({ queryKey: queryKeys.documents });
                    });
                },
              },
              cancel: {
                label: "Reload",
                onClick: () => {
                  void queryClient.invalidateQueries({ queryKey: queryKeys.documents });
                },
              },
              duration: 15_000,
            });
            return;
          }
          logClientError("useDocuments.save", e);
          toast.error("Could not save documents", {
            description: e instanceof Error ? e.message : "Please try again.",
          });
          await queryClient.invalidateQueries({ queryKey: queryKeys.documents });
          throw e;
        }
      };
      const queued = persistChain.current.then(run, run);
      persistChain.current = queued.catch(() => undefined);
      return queued;
    },
    [docs, queryClient, saveMutation],
  );

  const saveAgreements = useCallback(
    async (agreements: Agreement[], options: DocumentsPersistOptions = {}) => {
      await persist((current) => ({ ...current, agreements }), options);
    },
    [persist],
  );

  return {
    docs,
    loading,
    saving: saveMutation.isPending,
    persist,
    saveAgreements,
    isFetching: query.isFetching,
  };
}
