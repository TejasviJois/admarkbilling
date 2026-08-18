import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/reminders")({
  validateSearch: (search: Record<string, unknown>): { new?: boolean } => ({
    new: search.new === true || search.new === "true" || search.new === 1 ? true : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/calendar",
      search: search.new ? { reminder: true } : {},
    });
  },
});
