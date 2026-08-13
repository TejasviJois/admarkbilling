import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/documents/quotations/")({
  beforeLoad: () => {
    throw redirect({ to: "/documents/proposals" });
  },
});
