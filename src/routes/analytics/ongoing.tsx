import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/analytics/ongoing")({
  beforeLoad: () => {
    throw redirect({ to: "/projects" });
  },
});
