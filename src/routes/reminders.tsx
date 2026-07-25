import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BellRing, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReminderFormDialog } from "@/components/operations/ReminderFormDialog";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";
import { formatScheduleDateTime, sortScheduleEvents } from "@/lib/schedule";
import type { ScheduleEvent } from "@/lib/types";

export const Route = createFileRoute("/reminders")({
  component: RemindersPage,
  validateSearch: (search: Record<string, unknown>): { new?: boolean } => ({
    new: search.new === true || search.new === "true" || search.new === 1 ? true : undefined,
  }),
});

function RemindersPage() {
  const { ops, persist, loading } = useOperations();
  const { new: openNewOnArrival } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleEvent | null>(null);

  useEffect(() => {
    if (!openNewOnArrival) return;
    setEditing(null);
    setDialogOpen(true);
    void navigate({ search: {}, replace: true });
  }, [openNewOnArrival, navigate]);

  const reminders = useMemo(
    () =>
      sortScheduleEvents((ops.scheduleEvents ?? []).filter((event) => event.type === "reminder")),
    [ops.scheduleEvents],
  );
  const open = reminders.filter((event) => event.status === "scheduled");
  const done = reminders.filter((event) => event.status !== "scheduled");

  const saveReminder = (saved: ScheduleEvent) => {
    const events = ops.scheduleEvents ?? [];
    const next = editing
      ? events.map((event) => (event.id === saved.id ? saved : event))
      : [...events, saved];
    persist({ ...ops, scheduleEvents: next });
  };

  const markDone = (event: ScheduleEvent) => {
    persist({
      ...ops,
      scheduleEvents: (ops.scheduleEvents ?? []).map((item) =>
        item.id === event.id
          ? { ...item, status: "completed", updatedAt: Date.now() }
          : item,
      ),
    });
  };

  const removeReminder = (event: ScheduleEvent) => {
    if (!confirm(`Delete reminder "${event.title}"?`)) return;
    persist(
      {
        ...ops,
        scheduleEvents: (ops.scheduleEvents ?? []).filter((item) => item.id !== event.id),
      },
      { deleteIds: { scheduleEvents: [event.id] } },
    );
  };

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  if (loading) return <OperationsLoading />;

  return (
    <div className="space-y-6">
      <OperationsPageHeader
        title="Reminders"
        description="Follow-ups that are not full meetings — e.g. call a client after a set date."
        action={
          <div className="flex flex-wrap gap-2">
            <Link to="/calendar">
              <Button type="button" variant="outline" size="sm">
                Open Calendar
              </Button>
            </Link>
            <Button type="button" onClick={openAdd} className="gap-2">
              <Plus className="h-4 w-4" /> Add reminder
            </Button>
          </div>
        }
      />

      <section className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-bold text-foreground">Upcoming ({open.length})</h2>
          <p className="text-xs text-muted-foreground">Open follow-ups waiting for you</p>
        </div>
        <div className="space-y-3 p-5">
          {open.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
              <BellRing className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">No open reminders.</p>
              <Button type="button" size="sm" className="mt-3" onClick={openAdd}>
                <Plus className="mr-1.5 h-4 w-4" /> Add reminder
              </Button>
            </div>
          ) : (
            open.map((event) => (
              <div
                key={event.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-background/60 p-4"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{event.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatScheduleDateTime(event)}
                    {event.contact ? ` · ${event.contact}` : ""}
                  </p>
                  {event.notes ? (
                    <p className="mt-2 text-xs text-muted-foreground">{event.notes}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditing(event);
                      setDialogOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => markDone(event)}>
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Done
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-rose-500"
                    onClick={() => removeReminder(event)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {done.length > 0 && (
        <section className="rounded-xl border border-border bg-card/60 p-5 shadow-sm">
          <h2 className="text-sm font-bold text-muted-foreground">Completed ({done.length})</h2>
          <ul className="mt-3 space-y-2">
            {done.slice(0, 12).map((event) => (
              <li
                key={event.id}
                className="flex items-center justify-between gap-3 text-xs text-muted-foreground"
              >
                <span className="truncate">
                  {event.title}
                  <span className="ml-2 opacity-70">{formatScheduleDateTime(event)}</span>
                </span>
                <button
                  type="button"
                  className="shrink-0 text-rose-500 hover:underline"
                  onClick={() => removeReminder(event)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ReminderFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        reminder={editing}
        onSave={saveReminder}
      />
    </div>
  );
}
