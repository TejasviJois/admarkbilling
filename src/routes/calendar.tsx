import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  BellRing,
  CalendarDays,
  CheckCircle2,
  Trash2,
  Phone,
  Plus,
  Clock3,
  Calendar as CalendarIcon,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { OperationsLoading } from "@/components/operations/operations-ui";
import { ReminderFormDialog } from "@/components/operations/ReminderFormDialog";
import { useOperations } from "@/hooks/use-operations";
import {
  notifyScheduledEventCreated,
  useMeetingNotifications,
} from "@/lib/meeting-notifications";
import { formatScheduleDateTime, sortScheduleEvents } from "@/lib/schedule";
import type { ScheduleEvent } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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

type EventFilterType = "all" | "meeting" | "call" | "reminder";

function CalendarPage() {
  const { ops, persist, loading } = useOperations();
  const { new: openNewOnArrival, reminder: openReminderOnArrival } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null);
  const [defaultEventType, setDefaultEventType] = useState<ScheduleEvent["type"]>("meeting");
  const [activeTab, setActiveTab] = useState<EventFilterType>("all");
  const [filterBySelectedDate, setFilterBySelectedDate] = useState(false);

  // System & desktop meeting notifications
  useMeetingNotifications(ops?.scheduleEvents);

  useEffect(() => {
    if (!openNewOnArrival && !openReminderOnArrival) return;
    setEditingEvent(null);
    setDefaultEventType(openReminderOnArrival ? "reminder" : "meeting");
    setDialogOpen(true);
    navigate({ search: {}, replace: true });
  }, [openNewOnArrival, openReminderOnArrival, navigate]);

  const events = useMemo(() => ops.scheduleEvents ?? [], [ops.scheduleEvents]);
  const selectedKey = dateKey(selectedDate);

  const sortedEvents = useMemo(() => sortScheduleEvents(events), [events]);

  const openEvents = useMemo(() => {
    return sortedEvents.filter((ev) => {
      if (ev.status !== "scheduled") return false;
      if (activeTab === "meeting") return ev.type === "meeting";
      if (activeTab === "call") return ev.type === "call";
      if (activeTab === "reminder") return ev.type === "reminder";
      return true;
    });
  }, [sortedEvents, activeTab]);

  const recoverableDoneEvents = useMemo(() => {
    const cutoff = Date.now() - DONE_REMINDER_RETAIN_MS;
    return sortedEvents.filter((event) => {
      if (event.status === "scheduled") return false;
      const completedAt = event.updatedAt || event.createdAt || 0;
      return completedAt >= cutoff;
    });
  }, [sortedEvents]);

  // Calendar dates with active events
  const eventDates = useMemo(
    () => openEvents.map((event) => new Date(`${event.date}T12:00:00`)),
    [openEvents],
  );

  const openScheduleForSelectedDate = (type: ScheduleEvent["type"] = "meeting") => {
    setEditingEvent(null);
    setDefaultEventType(type);
    setDialogOpen(true);
  };

  const saveEvent = (saved: ScheduleEvent) => {
    const next = editingEvent
      ? events.map((event) => (event.id === saved.id ? saved : event))
      : [...events, saved];
    persist({ ...ops, scheduleEvents: next });
    notifyScheduledEventCreated(saved);
    toast.success(
      `${saved.type === "meeting" ? "Meeting" : saved.type === "call" ? "Call" : "Reminder"} saved!`,
    );
  };

  const updateEventStatus = (event: ScheduleEvent, status: ScheduleEvent["status"]) => {
    persist({
      ...ops,
      scheduleEvents: events.map((item) =>
        item.id === event.id ? { ...item, status, updatedAt: Date.now() } : item,
      ),
    });
    toast.info(status === "completed" ? "Marked as completed" : "Restored to schedule");
  };

  const deleteEvent = (event: ScheduleEvent) => {
    if (!confirm(`Delete "${event.title}"?`)) return;
    persist(
      { ...ops, scheduleEvents: events.filter((item) => item.id !== event.id) },
      { deleteIds: { scheduleEvents: [event.id] } },
    );
    toast.success("Event removed");
  };

  if (loading) return <OperationsLoading />;

  const displayedOpenEvents = filterBySelectedDate
    ? openEvents.filter((event) => event.date === selectedKey)
    : openEvents;

  const selectedDayEventsCount = openEvents.filter((event) => event.date === selectedKey).length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ff6b2b]/20 to-[#f04400]/10 border border-[#ff6b2b]/30 text-[#ff6b2b] shadow-lg shadow-orange-500/10">
              <CalendarDays className="h-5 w-5" strokeWidth={2} />
            </span>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white md:text-3xl">
                Meetings & Schedule
              </h1>
            </div>
          </div>
          <p className="mt-2 max-w-xl text-sm text-white/60">
            Meetings, phone calls, reminders, and client follow-ups with native system alerts.
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => openScheduleForSelectedDate("meeting")}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-[#ff6b2b] to-[#f04400] px-4 text-xs font-bold text-white shadow-lg shadow-orange-500/25 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            + Schedule Meeting
          </button>
          <button
            type="button"
            onClick={() => openScheduleForSelectedDate("call")}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 text-xs font-bold text-white hover:bg-white/10 transition-all cursor-pointer"
          >
            <Phone className="h-3.5 w-3.5 text-orange-400" />
            + Schedule Call
          </button>
          <button
            type="button"
            onClick={() => openScheduleForSelectedDate("reminder")}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 text-xs font-bold text-white hover:bg-white/10 transition-all cursor-pointer"
          >
            <BellRing className="h-3.5 w-3.5 text-rose-400" />
            + Reminder
          </button>
        </div>
      </div>

      {/* Main Grid: Left List + Right Calendar Picker */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_280px] xl:grid-cols-[minmax(0,1.5fr)_300px]">
        {/* Left Column: Events & Filter Tabs */}
        <div className="glass-panel rounded-3xl border border-white/10 p-6 shadow-2xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
            {/* Filter Tabs */}
            <div className="flex items-center rounded-full border border-white/10 bg-white/[0.04] p-1">
              {(
                [
                  { id: "all", label: "All Items" },
                  { id: "meeting", label: "Meetings" },
                  { id: "call", label: "Calls" },
                  { id: "reminder", label: "Reminders" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold transition-all cursor-pointer",
                    activeTab === tab.id
                      ? "bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-md shadow-orange-500/20"
                      : "text-white/60 hover:text-white",
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Filter by Selected Date Toggle */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFilterBySelectedDate((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer",
                  filterBySelectedDate
                    ? "border-orange-500/50 bg-orange-500/20 text-orange-400"
                    : "border-white/10 bg-white/5 text-white/60 hover:text-white",
                )}
              >
                <Clock3 className="h-3.5 w-3.5" />
                {filterBySelectedDate ? `Only ${selectedKey}` : "Show All Dates"}
              </button>
            </div>
          </div>

          {/* Events List */}
          {displayedOpenEvents.length === 0 ? (
            <div className="relative overflow-hidden py-14 text-center">
              <CheckCircle2
                className="pointer-events-none absolute -right-4 -top-2 h-36 w-36 text-white/[0.03]"
                strokeWidth={1}
                aria-hidden
              />
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <CheckCircle2 className="h-8 w-8" />
              </span>
              <p className="mt-4 text-base font-bold text-white">
                {filterBySelectedDate
                  ? `No events scheduled for ${selectedKey}`
                  : "No open schedule events"}
              </p>
              <p className="mt-1 text-xs text-white/50">
                Pick a date on the calendar and click "Schedule on This Date" to add an event.
              </p>
              <button
                type="button"
                onClick={() => openScheduleForSelectedDate("meeting")}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-orange-500/20 border border-orange-500/30 px-4 py-2 text-xs font-bold text-orange-400 hover:bg-orange-500/30 transition-all cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" /> Schedule for {selectedKey}
              </button>
            </div>
          ) : (
            <ul className="space-y-3">
              {displayedOpenEvents.map((event) => {
                const isMeeting = event.type === "meeting";
                const isCall = event.type === "call";
                const isReminder = event.type === "reminder";

                return (
                  <li
                    key={event.id}
                    className="glass-card flex items-start justify-between gap-4 rounded-2xl border border-white/10 p-4 transition-all hover:border-white/20"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                          isMeeting
                            ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            : isCall
                              ? "border border-orange-500/30 bg-orange-500/10 text-orange-400"
                              : "border border-rose-500/30 bg-rose-500/10 text-rose-400",
                        )}
                      >
                        {isMeeting ? (
                          <CalendarDays className="h-4 w-4" />
                        ) : isCall ? (
                          <Phone className="h-4 w-4" />
                        ) : (
                          <BellRing className="h-4 w-4" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-white">{event.title}</p>
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                              isMeeting
                                ? "bg-emerald-500/20 text-emerald-400"
                                : isCall
                                  ? "bg-orange-500/20 text-orange-400"
                                  : "bg-rose-500/20 text-rose-400",
                            )}
                          >
                            {event.type}
                          </span>
                        </div>
                        <p className="mt-1 text-xs font-semibold text-white/70">
                          {formatScheduleDateTime(event)}
                          {event.contact ? (
                            <span className="text-white/40"> · {event.contact}</span>
                          ) : (
                            ""
                          )}
                        </p>
                        {event.notes ? (
                          <p className="mt-1.5 line-clamp-2 text-xs text-white/50">
                            {event.notes}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex shrink-0 gap-1.5 pt-0.5">
                      <button
                        type="button"
                        onClick={() => updateEventStatus(event, "completed")}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-400 hover:bg-emerald-500/20 transition-all cursor-pointer"
                        title="Mark Done"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Done
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingEvent(event);
                          setDialogOpen(true);
                        }}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteEvent(event)}
                        className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/40 hover:bg-rose-500/10 hover:text-rose-400 transition-all cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Recoverable Done Items */}
          {recoverableDoneEvents.length > 0 ? (
            <div className="mt-8 border-t border-white/10 pt-5">
              <p className="text-xs font-bold uppercase tracking-wider text-white/40">
                Done · recoverable for 10 days ({recoverableDoneEvents.length})
              </p>
              <ul className="mt-3 space-y-2">
                {recoverableDoneEvents.map((event) => (
                  <li
                    key={event.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3.5 py-2.5 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-white/70 line-through">
                        {event.title}
                      </p>
                      <p className="truncate text-[11px] text-white/40">
                        {formatScheduleDateTime(event)}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        className="text-xs font-bold text-[#ff6b2b] hover:text-[#ff8a50] transition-colors cursor-pointer"
                        onClick={() => updateEventStatus(event, "scheduled")}
                      >
                        Restore
                      </button>
                      <button
                        type="button"
                        className="text-xs font-semibold text-rose-400/70 hover:text-rose-400 transition-colors cursor-pointer"
                        onClick={() => deleteEvent(event)}
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

        {/* Right Column: Calendar Picker with One-Click Date Scheduling */}
        <div className="glass-panel rounded-3xl border border-white/10 p-5 shadow-2xl h-fit space-y-4">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => {
              if (date) {
                setSelectedDate(date);
                setFilterBySelectedDate(true);
              }
            }}
            modifiers={{ hasEvent: eventDates }}
            modifiersClassNames={{
              hasEvent:
                "after:absolute after:bottom-0.5 after:left-1/2 after:h-1.5 after:w-1.5 after:-translate-x-1/2 after:rounded-full after:bg-[#ff6b2b] after:shadow-sm after:shadow-orange-500",
            }}
            className="mx-auto w-full max-w-[240px] rounded-none border-0 bg-transparent p-0 [--cell-size:1.85rem] text-xs text-white"
          />

          {/* Quick Schedule for Picked Date */}
          <div className="border-t border-white/10 pt-4 space-y-2">
            <div className="text-center">
              <p className="text-xs font-bold text-white">
                {selectedDate.toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
              <p className="text-[11px] text-white/50">
                {selectedDayEventsCount} event{selectedDayEventsCount === 1 ? "" : "s"} scheduled
              </p>
            </div>

            <button
              type="button"
              onClick={() => openScheduleForSelectedDate("meeting")}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#ff6b2b] to-[#f04400] py-2.5 text-xs font-bold text-white shadow-lg shadow-orange-500/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Schedule on This Date
            </button>
          </div>

          <p className="text-center text-[10px] font-semibold text-white/40">
            Orange dot = scheduled event on this day
          </p>
        </div>
      </div>

      {/* Reminder / Meeting Form Dialog */}
      <ReminderFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingEvent(null);
        }}
        reminder={editingEvent}
        defaultDate={selectedKey}
        defaultType={defaultEventType}
        onSave={saveEvent}
      />
    </div>
  );
}
