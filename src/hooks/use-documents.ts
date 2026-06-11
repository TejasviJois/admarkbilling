import { useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Agreement, DocumentsData } from "@/lib/types";
import { loadDocuments, saveDocuments } from "@/lib/documents-storage";
import { logClientError } from "@/lib/client-logger";
import { readClientCache, writeClientCache } from "@/lib/client-data-cache";
import { queryKeys } from "@/lib/query-keys";

const CACHE_KEY = "documents";
const EMPTY: DocumentsData = { agreements: [] };

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
    mutationFn: saveDocuments,
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.documents });
      queryClient.setQueryData(queryKeys.documents, next);
      writeClientCache(CACHE_KEY, next);
    },
    onError: (e) => logClientError("useDocuments.save", e),
  });

  const persist = useCallback(
    async (next: DocumentsData) => {
      try {
        await saveMutation.mutateAsync(next);
      } catch (e) {
        logClientError("useDocuments.save", e);
        throw e;
      }
    },
    [saveMutation],
  );

  const saveAgreements = useCallback(
    async (agreements: Agreement[]) => {
      await persist({ agreements });
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
