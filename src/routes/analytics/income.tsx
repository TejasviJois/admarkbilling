import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/analytics/income")({
  beforeLoad: () => {
    throw redirect({ to: "/accounts", hash: "income" });
  },
});
