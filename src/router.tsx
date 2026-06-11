import { createRouter } from "@tanstack/react-router";
import { RoutePending } from "@/components/ui/route-pending";
import { createQueryClient, QUERY_STALE_MS } from "@/lib/query-client";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = createQueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: QUERY_STALE_MS,
    defaultPendingMs: 0,
    defaultPendingComponent: RoutePending,
  });

  return router;
};
