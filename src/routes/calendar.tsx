import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BellRing, CalendarDays, CheckCircle2, Trash2 } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { OperationsLoading } from "@/components/operations/operations-ui";
import { ReminderFormDialog } from "@/components/operations/ReminderFormDialog";
import { useOperations } from "@/hooks/use-operations";
import { formatScheduleDateTime, sortScheduleEvents } from "@/lib/schedule";
import type { ScheduleEvent } from "@/lib/types";

export const Route = createFileRoute("/calendar")({
  component: CalendarPage,
  validateSearch: (search: Record<string, unknown>): { new?: boolean; reminder?: boolean } => ({
    new: search.new === true || search.new === "true" || search.new === 1 ? true : undefined,
    reminder:
      search.reminder === true || search.reminder === "true" || search.reminder === 1
        ? true
        : undefined,
  }),
});

const DONE_REMINDER_RETAIN_MS = 10 * 24 * 60 * 60 * 1000;

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function CalendarPage() {
  const { ops, persist, loading } = useOperations();
  const { new: openNewOnArrival, reminder: openReminderOnArrival } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<ScheduleEvent | null>(null);

  useEffect(() => {
    // Legacy ?new=true used to open the meeting scheduler — open a reminder instead.
    if (!openNewOnArrival && !openReminderOnArrival) return;
    setEditingReminder(null);
    setReminderDialogOpen(true);
    navigate({ search: {}, replace: true });
  }, [openNewOnArrival, openReminderOnArrival, navigate]);

  const events = useMemo(() => ops.scheduleEvents ?? [], [ops.scheduleEvents]);
  const selectedKey = dateKey(selectedDate);

  const reminders = useMemo(
    () => sortScheduleEvents(events.filter((event) => event.type === "reminder")),
    [events],
  );
  const openReminders = reminders.filter((event) => event.status === "scheduled");
  const recoverableDoneReminders = useMemo(() => {
    const cutoff = Date.now() - DONE_REMINDER_RETAIN_MS;
    return reminders.filter((event) => {
      if (event.status === "scheduled") return false;
      const completedAt = event.updatedAt || event.createdAt || 0;
      return completedAt >= cutoff;
    });
  }, [reminders]);

  const reminderDates = useMemo(
    () =>
      openReminders.map((event) => new Date(`${event.date}T12:00:00`)),
    [openReminders],
  );

  const openNewReminder = () => {
    setEditingReminder(null);
    setReminderDialogOpen(true);
  };

  const saveReminder = (saved: ScheduleEvent) => {
    const next = editingReminder
      ? events.map((event) => (event.id === saved.id ? saved : event))
      : [...events, saved];
    persist({ ...ops, scheduleEvents: next });
  };

  const updateReminderStatus = (event: ScheduleEvent, status: ScheduleEvent["status"]) => {
    persist({
      ...ops,
      scheduleEvents: events.map((item) =>
        item.id === event.id ? { ...item, status, updatedAt: Date.now() } : item,
      ),
    });
  };

  const deleteReminder = (event: ScheduleEvent) => {
    if (!confirm(`Delete reminder "${event.title}"?`)) return;
    persist(
      { ...ops, scheduleEvents: events.filter((item) => item.id !== event.id) },
      { deleteIds: { scheduleEvents: [event.id] } },
    );
  };

  if (loading) return <OperationsLoading />;

  const selectedDayReminders = openReminders.filter((event) => event.date === selectedKey);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400">
              <CalendarDays className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              Reminders
            </h1>
          </div>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Follow-ups and tasks. Completed items stay recoverable for 10 days.
          </p>
        </div>
        <button
          type="button"
          onClick={openNewReminder}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <BellRing className="h-4 w-4" />
          Reminder
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_220px] xl:grid-cols-[minmax(0,1.5fr)_240px]">
        <div className="rounded-xl border border-border/80 bg-card/40 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">Open</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {selectedDayReminders.length > 0
                  ? `${selectedDayReminders.length} on the selected day · ${openReminders.length} total`
                  : `${openReminders.length} open reminder${openReminders.length === 1 ? "" : "s"}`}
              </p>
            </div>
            <button
              type="button"
              onClick={openNewReminder}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border/80 px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/40"
            >
              <BellRing className="h-4 w-4" />
              Add reminder
            </button>
          </div>

          {openReminders.length === 0 ? (
            <div className="relative mt-8 overflow-hidden py-10 text-center">
              <CheckCircle2
                className="pointer-events-none absolute -right-2 -top-1 h-28 w-28 text-muted-foreground/10"
                strokeWidth={1}
                aria-hidden
              />
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/10 text-rose-400">
                <BellRing className="h-6 w-6" />
              </span>
              <p className="mt-4 text-base text-muted-foreground">
                No open reminders. You’re all caught up!
              </p>
            </div>
          ) : (
            <ul className="mt-5 divide-y divide-border/80">
              {openReminders.map((event) => (
                <li key={event.id} className="flex items-start justify-between gap-3 py-4">
                  <div className="min-w-0">
                    <p className="text-base font-medium text-foreground">{event.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatScheduleDateTime(event)}
                      {event.contact ? ` · ${event.contact}` : ""}
                    </p>
                    {event.notes ? (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground/90">
                        {event.notes}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => updateReminderStatus(event, "completed")}
                      className="rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                      title="Done"
                    >
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 className="h-4 w-4" />
                        Done
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingReminder(event);
                        setReminderDialogOpen(true);
                      }}
                      className="rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteReminder(event)}
                      className="rounded-md p-2 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-400"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {recoverableDoneReminders.length > 0 ? (
            <div className="mt-6 border-t border-border/80 pt-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Done · recoverable for 10 days · {recoverableDoneReminders.length}
              </p>
              <ul className="mt-3 space-y-2">
                {recoverableDoneReminders.map((event) => (
                  <li
                    key={event.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2.5 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground/90">{event.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatScheduleDateTime(event)}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        className="text-sm font-medium text-primary hover:underline"
                        onClick={() => updateReminderStatus(event, "scheduled")}
                      >
                        Restore
                      </button>
                      <button
                        type="button"
                        className="text-sm text-rose-400 hover:text-rose-300"
                        onClick={() => deleteReminder(event)}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-border/80 bg-card/40 p-3">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => date && setSelectedDate(date)}
            modifiers={{ hasEvent: reminderDates }}
            modifiersClassNames={{
              hasEvent:
                "after:absolute after:bottom-0.5 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-primary",
            }}
            className="mx-auto w-full max-w-[220px] rounded-none border-0 bg-transparent p-0 [--cell-size:1.65rem] text-xs"
          />
          <p className="mt-2 text-center text-[10px] text-muted-foreground">
            Dot = open reminder that day
          </p>
        </div>
      </div>

      <ReminderFormDialog
        open={reminderDialogOpen}
        onOpenChange={(open) => {
          setReminderDialogOpen(open);
          if (!open) setEditingReminder(null);
        }}
        reminder={editingReminder}
        onSave={saveReminder}
      />
    </div>
  );
}
