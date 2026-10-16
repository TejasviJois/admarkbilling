import { useEffect } from "react";
import { toast } from "sonner";
import { formatScheduleDateTime, scheduleEventDate } from "./schedule";
import type { ScheduleEvent } from "./types";

/**
 * Checks system notification support and current permission state.
 */
export function getSystemNotificationStatus(): "granted" | "denied" | "default" | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

/**
 * Prompts user for system notification permission if not yet decided.
 */
export async function requestSystemNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return false;
  }
  if (Notification.permission === "granted") {
    return true;
  }
  if (Notification.permission !== "denied") {
    try {
      const perm = await Notification.requestPermission();
      if (perm === "granted") {
        playNotificationChime();
        toast.success("System notifications enabled", {
          description: "You will receive desktop and mobile alerts for all future scheduled events.",
        });
        return true;
      }
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Clean native audio chime using Web Audio API without external file dependencies.
 */
export function playNotificationChime(): void {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08); // A5

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch {
    // Audio context may be restricted before user gesture
  }
}

/**
 * Dispatches an instant confirmation notification when any future event is scheduled.
 */
export function notifyScheduledEventCreated(ev: ScheduleEvent): void {
  if (typeof window === "undefined") return;

  const dateStr = formatScheduleDateTime(ev);
  const typeLabel =
    ev.type === "meeting"
      ? "📅 Meeting Scheduled"
      : ev.type === "call"
        ? "📞 Call Scheduled"
        : "⏰ Reminder Scheduled";

  const body = `"${ev.title}" on ${dateStr}.${ev.contact ? ` With ${ev.contact}.` : ""} You will be alerted before it starts.`;

  // System notification
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      new Notification(typeLabel, {
        body,
        icon: "/favicon.png",
        badge: "/favicon-32.png",
        tag: `admark-scheduled-${ev.id}`,
      });
      playNotificationChime();
    } catch {
      // Fallback
    }
  }
}

/**
 * Monitors and notifies for ALL upcoming and due scheduled events (meetings, calls, reminders).
 */
export function checkAndNotifyUpcomingSchedule(events: ScheduleEvent[]): void {
  if (typeof window === "undefined") return;

  const now = Date.now();
  const upcomingEvents = events.filter((e) => {
    if (e.status !== "scheduled") return false;
    const eventTime = scheduleEventDate(e).getTime();
    if (Number.isNaN(eventTime)) return false;

    const diffMs = eventTime - now;
    // Reminder lead time in minutes (default: 15m for meetings/calls, up to 12h or configured for reminders)
    const reminderLeadMs = (e.reminderMinutes || (e.type === "meeting" ? 15 : e.type === "call" ? 30 : 60)) * 60_000;

    // Notify if within the lead time in the future OR within 15 minutes past start
    return diffMs >= -15 * 60_000 && diffMs <= reminderLeadMs;
  });

  for (const ev of upcomingEvents) {
    const storageKey = `admark.notified-event.${ev.id}.${ev.date}.${ev.startTime || "0"}`;
    if (sessionStorage.getItem(storageKey)) {
      continue;
    }

    sessionStorage.setItem(storageKey, "true");

    const titlePrefix =
      ev.type === "meeting"
        ? "📅 Upcoming Meeting"
        : ev.type === "call"
          ? "📞 Upcoming Call"
          : "⏰ Scheduled Reminder";

    const body = `${ev.title}${ev.startTime ? " at " + ev.startTime : ""}${ev.contact ? " with " + ev.contact : ""}${ev.notes ? " — " + ev.notes : ""}`;

    // 1. Browser Native System Notification
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification(titlePrefix, {
          body,
          icon: "/favicon.png",
          badge: "/favicon-32.png",
          tag: `admark-due-${ev.id}`,
        });
        playNotificationChime();
      } catch {
        // Fallback
      }
    }

    // 2. In-App Interactive Toast Notification
    toast.info(titlePrefix, {
      description: body,
      duration: 10_000,
    });
  }
}

// Backward compatibility alias
export const checkAndNotifyUpcomingMeetings = checkAndNotifyUpcomingSchedule;

/**
 * Hook to continuously monitor and alert for scheduled future events.
 */
export function useMeetingNotifications(events: ScheduleEvent[] | undefined): void {
  useEffect(() => {
    if (!events || events.length === 0) return;

    // Check immediately on load or event list update
    checkAndNotifyUpcomingSchedule(events);

    // Periodically check every 25 seconds
    const interval = window.setInterval(() => {
      checkAndNotifyUpcomingSchedule(events);
    }, 25_000);

    return () => window.clearInterval(interval);
  }, [events]);
}

export const useScheduleNotifications = useMeetingNotifications;
