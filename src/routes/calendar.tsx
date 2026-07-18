import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
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
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { ScheduleEventDialog } from "@/components/operations/ScheduleEventDialog";
import { useOperations } from "@/hooks/use-operations";
import { formatScheduleDateTime, sortScheduleEvents } from "@/lib/schedule";
import { safeHref } from "@/lib/utils";
import type { ScheduleEvent } from "@/lib/types";

export const Route = createFileRoute("/calendar")({
  component: CalendarPage,
  // `?new=1` opens the schedule dialog immediately (used by Dashboard shortcuts).
  validateSearch: (search: Record<string, unknown>): { new?: boolean } => ({
    new: search.new === true || search.new === "true" || search.new === 1 ? true : undefined,
  }),
});

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function CalendarPage() {
  const { ops, persist, loading } = useOperations();
  const { new: openNewOnArrival } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleEvent | null>(null);

  useEffect(() => {
    if (!openNewOnArrival) return;
    setEditing(null);
    setDialogOpen(true);
    // Drop the param so refresh/back doesn't reopen the dialog.
    navigate({ search: {}, replace: true });
  }, [openNewOnArrival, navigate]);
  const events = useMemo(() => ops.scheduleEvents ?? [], [ops.scheduleEvents]);
  const selectedKey = dateKey(selectedDate);

  const selectedEvents = useMemo(
    () => sortScheduleEvents(events.filter((event) => event.date === selectedKey)),
    [events, selectedKey],
  );
  const eventDates = useMemo(
    () =>
      events
        .filter((event) => event.status === "scheduled")
        .map((event) => new Date(`${event.date}T12:00:00`)),
    [events],
  );

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

  if (loading) return <OperationsLoading />;

  return (
    <div className="space-y-6">
      <OperationsPageHeader
        title="Calendar & Schedule"
        description="Create meetings and calls here. Upcoming schedules are reminded on your Dashboard."
        action={
          <Button type="button" onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" /> New schedule
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
        <div className="overflow-hidden rounded-xl border border-border bg-card p-3 shadow-sm">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => date && setSelectedDate(date)}
            modifiers={{ hasEvent: eventDates }}
            modifiersClassNames={{
              hasEvent:
                "after:absolute after:bottom-0.5 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-primary",
            }}
            className="w-full"
          />
          <div className="border-t border-border px-2 pt-3 text-xs text-muted-foreground">
            Dates with a dot have a scheduled meeting or call.
          </div>
        </div>

        <section className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 className="font-bold text-foreground">
                {selectedDate.toLocaleDateString("en-IN", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </h2>
              <p className="text-xs text-muted-foreground">
                {selectedEvents.length} scheduled item{selectedEvents.length === 1 ? "" : "s"}
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={openNew}>
              <Plus className="mr-1.5 h-4 w-4" /> Add on this date
            </Button>
          </div>

          <div className="space-y-3 p-5">
            {selectedEvents.length === 0 ? (
              <div className="flex min-h-56 flex-col items-center justify-center text-center">
                <CalendarDays className="h-10 w-10 text-muted-foreground/50" />
                <p className="mt-3 text-sm font-semibold">Nothing scheduled</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Add a meeting or call for this date.
                </p>
                <Button type="button" size="sm" className="mt-4" onClick={openNew}>
                  Create schedule
                </Button>
              </div>
            ) : (
              selectedEvents.map((event) => (
                <article
                  key={event.id}
                  className={`rounded-lg border p-4 ${
                    event.status === "completed"
                      ? "border-emerald-500/25 bg-emerald-500/5"
                      : event.status === "cancelled"
                        ? "border-border bg-muted/30 opacity-65"
                        : "border-border bg-background"
                  }`}
                >
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            event.type === "call"
                              ? "bg-blue-500/10 text-blue-600"
                              : "bg-violet-500/10 text-violet-600"
                          }`}
                        >
                          {event.type}
                        </span>
                        {event.status !== "scheduled" && (
                          <span className="text-[10px] font-bold uppercase text-muted-foreground">
                            {event.status}
                          </span>
                        )}
                      </div>
                      <h3 className="mt-2 font-bold text-foreground">{event.title}</h3>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="h-3.5 w-3.5" />
                          {formatScheduleDateTime(event)} · {event.durationMinutes} min
                        </span>
                        {event.contact && (
                          <span className="inline-flex items-center gap-1">
                            {event.type === "call" ? (
                              <Phone className="h-3.5 w-3.5" />
                            ) : (
                              <Users className="h-3.5 w-3.5" />
                            )}
                            {event.contact}
                          </span>
                        )}
                        {event.location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" /> {event.location}
                          </span>
                        )}
                      </div>
                      {event.notes && (
                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                          {event.notes}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      {safeHref(event.meetingUrl) && event.status === "scheduled" && (
                        <Button asChild size="sm" variant="outline">
                          <a
                            href={safeHref(event.meetingUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Join <ExternalLink className="ml-1 h-3.5 w-3.5" />
                          </a>
                        </Button>
                      )}
                      {event.status === "scheduled" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => updateStatus(event, "completed")}
                        >
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Done
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditing(event);
                          setDialogOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive"
                        onClick={() => deleteEvent(event)}
                        aria-label={`Delete ${event.title}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
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
    </div>
  );
}
