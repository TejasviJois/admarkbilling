import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/analytics/revenue")({
  beforeLoad: () => {
    throw redirect({ to: "/accounts/billing" });
  },
});
