import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/analytics/expenses")({
  beforeLoad: () => {
    throw redirect({ to: "/accounts", hash: "expenses" });
  },
});
