import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/documents/quotations/$companyKey")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/documents/proposals/$companyKey",
      params: { companyKey: params.companyKey },
    });
  },
});
