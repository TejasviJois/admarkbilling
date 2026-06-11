import { QueryClient } from "@tanstack/react-query";

const STALE_MS = 5 * 60_000;
const GC_MS = 30 * 60_000;

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_MS,
        gcTime: GC_MS,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: 1,
      },
    },
  });
}

export { STALE_MS as QUERY_STALE_MS };
