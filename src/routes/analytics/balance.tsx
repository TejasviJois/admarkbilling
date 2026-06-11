import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/analytics/balance")({
  beforeLoad: () => {
    throw redirect({ to: "/analytics" });
  },
});
