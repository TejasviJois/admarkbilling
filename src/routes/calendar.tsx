import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  BellRing,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  MapPin,
  Phone,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { OperationsLoading } from "@/components/operations/operations-ui";
import { ReminderFormDialog } from "@/components/operations/ReminderFormDialog";
import { ScheduleEventDialog } from "@/components/operations/ScheduleEventDialog";
import { useOperations } from "@/hooks/use-operations";
import { formatScheduleDateTime, sortScheduleEvents } from "@/lib/schedule";
import { cn, safeHref } from "@/lib/utils";
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

const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function typeLabel(type: ScheduleEvent["type"]): string {
  if (type === "call") return "Call";
  if (type === "reminder") return "Reminder";
  return "Meeting";
}

function formatHour(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

function parseStartHour(event: ScheduleEvent): number | null {
  const raw = event.startTime?.trim();
  if (!raw) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (!match) return null;
  const hour = Number(match[1]);
  if (Number.isNaN(hour) || hour < 0 || hour > 23) return null;
  return hour;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(12, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function CalendarPage() {
  const { ops, persist, loading } = useOperations();
  const { new: openNewOnArrival, reminder: openReminderOnArrival } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [view, setView] = useState<"day" | "week">("day");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleEvent | null>(null);
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<ScheduleEvent | null>(null);

  useEffect(() => {
    if (!openNewOnArrival) return;
    setEditing(null);
    setDialogOpen(true);
    navigate({ search: {}, replace: true });
  }, [openNewOnArrival, navigate]);

  useEffect(() => {
    if (!openReminderOnArrival) return;
    setEditingReminder(null);
    setReminderDialogOpen(true);
    navigate({ search: {}, replace: true });
  }, [openReminderOnArrival, navigate]);

  const events = useMemo(() => ops.scheduleEvents ?? [], [ops.scheduleEvents]);
  const selectedKey = dateKey(selectedDate);

  const selectedEvents = useMemo(
    () =>
      sortScheduleEvents(
        events.filter((event) => event.date === selectedKey && event.type !== "reminder"),
      ),
    [events, selectedKey],
  );

  const weekDays = useMemo(() => {
    const start = startOfWeek(selectedDate);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [selectedDate]);

  const weekEvents = useMemo(() => {
    const keys = new Set(weekDays.map(dateKey));
    return sortScheduleEvents(
      events.filter((event) => keys.has(event.date) && event.type !== "reminder"),
    );
  }, [events, weekDays]);

  const reminders = useMemo(
    () => sortScheduleEvents(events.filter((event) => event.type === "reminder")),
    [events],
  );
  const openReminders = reminders.filter((event) => event.status === "scheduled");
  const doneReminders = reminders.filter((event) => event.status !== "scheduled");
  const eventDates = useMemo(
    () =>
      events
        .filter((event) => event.status === "scheduled")
        .map((event) => new Date(`${event.date}T12:00:00`)),
    [events],
  );

  const timedEvents = selectedEvents.filter((event) => parseStartHour(event) != null);
  const allDayEvents = selectedEvents.filter((event) => parseStartHour(event) == null);

  const saveEvent = (saved: ScheduleEvent) => {
    const next = editing
      ? events.map((event) => (event.id === saved.id ? saved : event))
      : [...events, saved];
    persist({ ...ops, scheduleEvents: next });
  };

  const updateStatus = (event: ScheduleEvent, status: ScheduleEvent["status"]) => {
    persist({
      ...ops,
      scheduleEvents: events.map((item) =>
        item.id === event.id ? { ...item, status, updatedAt: Date.now() } : item,
      ),
    });
  };

  const deleteEvent = (event: ScheduleEvent) => {
    if (!confirm(`Delete "${event.title}"?`)) return;
    persist(
      { ...ops, scheduleEvents: events.filter((item) => item.id !== event.id) },
      { deleteIds: { scheduleEvents: [event.id] } },
    );
  };

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

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

  const selectedLabel = selectedDate.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const dayCount = selectedEvents.length;
  const weekCount = weekEvents.length;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400">
              <CalendarDays className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              Schedule
            </h1>
          </div>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Meetings, calls, and follow-ups.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openNewReminder}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border/80 px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/40"
          >
            <BellRing className="h-4 w-4" />
            Reminder
          </button>
          <button
            type="button"
            onClick={openNew}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Schedule
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)]">
        {/* Left rail */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border/80 bg-card/40 p-4">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              modifiers={{ hasEvent: eventDates }}
              modifiersClassNames={{
                hasEvent:
                  "after:absolute after:bottom-0.5 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-primary",
              }}
              className="w-full rounded-none border-0 bg-transparent p-0"
            />
            <p className="mt-3 text-[11px] text-muted-foreground">
              Dot = scheduled item that day.
            </p>
          </div>

          <div className="rounded-xl border border-border/80 bg-card/40 p-4">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">Reminders</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Follow-ups that aren’t meetings</p>

            {openReminders.length === 0 ? (
              <div className="relative mt-6 overflow-hidden py-6 text-center">
                <CheckCircle2
                  className="pointer-events-none absolute -right-2 -top-1 h-24 w-24 text-muted-foreground/10"
                  strokeWidth={1}
                  aria-hidden
                />
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-400">
                  <BellRing className="h-5 w-5" />
                </span>
                <p className="mt-3 text-sm text-muted-foreground">
                  No open reminders. You’re all caught up!
                </p>
              </div>
            ) : (
              <ul className="mt-4 divide-y divide-border/80">
                {openReminders.map((event) => (
                  <li key={event.id} className="flex items-start justify-between gap-2 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{event.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatScheduleDateTime(event)}
                        {event.contact ? ` · ${event.contact}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-0.5">
                      <button
                        type="button"
                        onClick={() => updateReminderStatus(event, "completed")}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                        title="Done"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteReminder(event)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-400"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {doneReminders.length > 0 ? (
              <div className="mt-4 border-t border-border/80 pt-3">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Done · {doneReminders.length}
                </p>
                <ul className="mt-2 space-y-1.5">
                  {doneReminders.slice(0, 5).map((event) => (
                    <li
                      key={event.id}
                      className="flex items-center justify-between gap-2 text-xs text-muted-foreground"
                    >
                      <span className="min-w-0 truncate">{event.title}</span>
                      <button
                        type="button"
                        className="shrink-0 text-rose-400 hover:text-rose-300"
                        onClick={() => deleteReminder(event)}
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>

        {/* Main day / week panel */}
        <section className="min-w-0 rounded-xl border border-border/80 bg-card/40">
          <div className="flex flex-col gap-3 border-b border-border/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                {selectedLabel}
              </h2>
              <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                {view === "day"
                  ? `${dayCount} item${dayCount === 1 ? "" : "s"} scheduled`
                  : `${weekCount} item${weekCount === 1 ? "" : "s"} this week`}
              </p>
            </div>
            <div className="inline-flex items-center rounded-lg border border-border/80 bg-background/40 p-0.5">
              <button
                type="button"
                aria-pressed={view === "day"}
                onClick={() => setView("day")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  view === "day"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Day
              </button>
              <button
                type="button"
                aria-pressed={view === "week"}
                onClick={() => setView("week")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  view === "week"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Week
              </button>
              <button
                type="button"
                onClick={() => setSelectedDate(new Date())}
                className="rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                title="Jump to today"
                aria-label="Jump to today"
              >
                <CalendarDays className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {view === "day" ? (
            <div className="relative min-h-[420px] px-2 py-2 sm:px-4">
              {/* All day */}
              <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2 border-b border-border/60 py-2">
                <span className="pt-1 text-right text-[11px] text-muted-foreground">All day</span>
                <div className="min-h-8 space-y-1.5">
                  {allDayEvents.map((event) => (
                    <EventChip
                      key={event.id}
                      event={event}
                      onEdit={() => {
                        setEditing(event);
                        setDialogOpen(true);
                      }}
                      onDone={() => updateStatus(event, "completed")}
                      onDelete={() => deleteEvent(event)}
                    />
                  ))}
                </div>
              </div>

              {HOURS.map((hour) => {
                const slotEvents = timedEvents.filter((event) => parseStartHour(event) === hour);
                return (
                  <div
                    key={hour}
                    className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2 border-b border-border/40 py-2 last:border-b-0"
                  >
                    <span className="pt-1 text-right text-[11px] tabular-nums text-muted-foreground">
                      {formatHour(hour)}
                    </span>
                    <div className="min-h-10 space-y-1.5">
                      {slotEvents.map((event) => (
                        <EventChip
                          key={event.id}
                          event={event}
                          onEdit={() => {
                            setEditing(event);
                            setDialogOpen(true);
                          }}
                          onDone={() => updateStatus(event, "completed")}
                          onDelete={() => deleteEvent(event)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}

              {selectedEvents.length === 0 ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
                  <div className="pointer-events-auto max-w-sm text-center">
                    <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted/40 text-muted-foreground">
                      <CalendarDays className="h-6 w-6" strokeWidth={1.5} />
                    </span>
                    <p className="mt-4 text-sm text-muted-foreground">
                      Nothing on this day. Schedule a meeting or add a task to get started.
                    </p>
                    <button
                      type="button"
                      onClick={openNew}
                      className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                    >
                      <Plus className="h-4 w-4" />
                      Schedule
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="p-4">
              {weekEvents.length === 0 ? (
                <div className="flex min-h-[280px] flex-col items-center justify-center px-6 text-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/40 text-muted-foreground">
                    <CalendarDays className="h-6 w-6" strokeWidth={1.5} />
                  </span>
                  <p className="mt-4 text-sm text-muted-foreground">
                    Nothing scheduled this week.
                  </p>
                  <button
                    type="button"
                    onClick={openNew}
                    className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    <Plus className="h-4 w-4" />
                    Schedule
                  </button>
                </div>
              ) : (
                <ul className="divide-y divide-border/80 border-y border-border/80">
                  {weekEvents.map((event) => (
                    <li key={event.id} className="py-3">
                      <EventChip
                        event={event}
                        showDate
                        onEdit={() => {
                          setEditing(event);
                          setDialogOpen(true);
                        }}
                        onDone={() => updateStatus(event, "completed")}
                        onDelete={() => deleteEvent(event)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      </div>

      <ScheduleEventDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        event={editing}
        initialDate={selectedKey}
        onSave={saveEvent}
      />
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

function EventChip({
  event,
  showDate,
  onEdit,
  onDone,
  onDelete,
}: {
  event: ScheduleEvent;
  showDate?: boolean;
  onEdit: () => void;
  onDone: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border/80 bg-background/50 px-3 py-2",
        event.status === "cancelled" && "opacity-55",
        event.status === "completed" && "opacity-80",
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[11px] font-medium text-rose-400">{typeLabel(event.type)}</span>
            {event.status !== "scheduled" ? (
              <span className="text-[11px] capitalize text-muted-foreground">· {event.status}</span>
            ) : null}
          </div>
          <p className="mt-0.5 text-sm font-medium text-foreground">{event.title}</p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3 w-3" />
              {showDate ? formatScheduleDateTime(event) : `${event.startTime || "All day"} · ${event.durationMinutes} min`}
            </span>
            {event.contact ? (
              <span className="inline-flex items-center gap-1">
                {event.type === "call" ? (
                  <Phone className="h-3 w-3" />
                ) : (
                  <Users className="h-3 w-3" />
                )}
                {event.contact}
              </span>
            ) : null}
            {event.location ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {event.location}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-0.5">
          {safeHref(event.meetingUrl) && event.status === "scheduled" ? (
            <a
              href={safeHref(event.meetingUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            >
              Join <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
          {event.status === "scheduled" ? (
            <button
              type="button"
              onClick={onDone}
              className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            >
              <CheckCircle2 className="h-3 w-3" />
              Done
            </button>
          ) : null}
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex h-7 items-center rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex h-7 items-center rounded-md px-2 text-xs text-rose-400 transition-colors hover:bg-rose-500/10"
            aria-label={`Delete ${event.title}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
