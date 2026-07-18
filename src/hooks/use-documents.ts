import { useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Agreement, DocumentsData } from "@/lib/types";
import {
  DocumentsConflictError,
  applyDocumentsMutation,
  loadDocuments,
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
    onMutate: async ({ next }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.documents });
      queryClient.setQueryData(queryKeys.documents, next);
      writeClientCache(CACHE_KEY, next);
    },
  });

  const persist = useCallback(
    async (next: DocumentsData, options: DocumentsPersistOptions = {}) => {
      try {
        const saved = await saveMutation.mutateAsync({ next, options });
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
                // Replay only the attempted mutation on the latest server
                // state so rows created elsewhere are never treated as deletes.
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
                  });
              },
            },
            cancel: {
              label: "Reload",
              onClick: () => {
                void queryClient.invalidateQueries({ queryKey: queryKeys.documents });
              },
            },
          });
          return;
        }
        logClientError("useDocuments.save", e);
        throw e;
      }
    },
    [queryClient, saveMutation],
  );

  const saveAgreements = useCallback(
    async (agreements: Agreement[], options: DocumentsPersistOptions = {}) => {
      await persist({ ...docs, agreements }, options);
    },
    [docs, persist],
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
