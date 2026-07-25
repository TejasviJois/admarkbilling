import type { ScheduleEvent } from "./types";

export function scheduleEventDate(event: Pick<ScheduleEvent, "date" | "startTime">): Date {
  return new Date(`${event.date}T${event.startTime || "00:00"}:00`);
}

export function isUpcomingScheduleEvent(event: ScheduleEvent, now = new Date()): boolean {
  if (event.status !== "scheduled") return false;
  const start = scheduleEventDate(event).getTime();
  if (Number.isNaN(start)) return false;
  // Reminders stay visible after their start time until marked done.
  if (event.type === "reminder") return true;
  return start >= now.getTime();
}

export function sortScheduleEvents(events: ScheduleEvent[]): ScheduleEvent[] {
  return [...events].sort(
    (a, b) => scheduleEventDate(a).getTime() - scheduleEventDate(b).getTime(),
  );
}

export function formatScheduleDateTime(event: Pick<ScheduleEvent, "date" | "startTime">): string {
  const date = scheduleEventDate(event);
  if (Number.isNaN(date.getTime())) return `${event.date} ${event.startTime}`;
  return date.toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function scheduleReminderState(
  event: ScheduleEvent,
  now = new Date(),
): "due" | "soon" | "upcoming" {
  const minutesUntil = (scheduleEventDate(event).getTime() - now.getTime()) / 60_000;
  if (event.type === "reminder") {
    // Reminder is due from its start time onward (until marked done).
    if (minutesUntil <= 0) return "due";
    if (minutesUntil <= event.reminderMinutes) return "due";
    if (minutesUntil <= 24 * 60) return "soon";
    return "upcoming";
  }
  if (minutesUntil <= event.reminderMinutes) return "due";
  if (minutesUntil <= 24 * 60) return "soon";
  return "upcoming";
}
