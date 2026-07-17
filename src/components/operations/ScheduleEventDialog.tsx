import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/operations/operations-ui";
import type { ScheduleEvent, ScheduleEventType } from "@/lib/types";

const EMPTY_FORM = {
  title: "",
  type: "meeting" as ScheduleEventType,
  date: "",
  startTime: "10:00",
  durationMinutes: "30",
  contact: "",
  location: "",
  meetingUrl: "",
  reminderMinutes: "30",
  notes: "",
};

export function ScheduleEventDialog({
  open,
  onOpenChange,
  event,
  initialDate,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: ScheduleEvent | null;
  initialDate?: string;
  onSave: (event: ScheduleEvent) => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (!open) return;
    if (event) {
      setForm({
        title: event.title,
        type: event.type,
        date: event.date,
        startTime: event.startTime,
        durationMinutes: String(event.durationMinutes),
        contact: event.contact ?? "",
        location: event.location ?? "",
        meetingUrl: event.meetingUrl ?? "",
        reminderMinutes: String(event.reminderMinutes),
        notes: event.notes ?? "",
      });
      return;
    }
    setForm({
      ...EMPTY_FORM,
      date: initialDate ?? new Date().toISOString().slice(0, 10),
    });
  }, [open, event, initialDate]);

  const handleSubmit = (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    const durationMinutes = Number(form.durationMinutes);
    const reminderMinutes = Number(form.reminderMinutes);
    if (!form.title.trim() || !form.date || !form.startTime) return;
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      alert("Duration must be greater than zero.");
      return;
    }

    const now = Date.now();
    onSave({
      ...(event ?? {}),
      id: event?.id ?? `schedule-${crypto.randomUUID().slice(0, 8)}`,
      title: form.title.trim(),
      type: form.type,
      date: form.date,
      startTime: form.startTime,
      durationMinutes,
      contact: form.contact.trim() || undefined,
      location: form.location.trim() || undefined,
      meetingUrl: form.meetingUrl.trim() || undefined,
      reminderMinutes: Number.isFinite(reminderMinutes) ? Math.max(0, reminderMinutes) : 30,
      notes: form.notes.trim() || undefined,
      status: event?.status ?? "scheduled",
      createdAt: event?.createdAt ?? now,
      updatedAt: now,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{event ? "Edit schedule" : "Schedule meeting or call"}</DialogTitle>
          <DialogDescription>
            This will appear in your calendar and Dashboard reminders.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Title *" id="schedule-title">
            <Input
              id="schedule-title"
              value={form.title}
              onChange={(e) => setForm((value) => ({ ...value, title: e.target.value }))}
              placeholder="e.g. Project kickoff with Kapila"
              required
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type *" id="schedule-type">
              <Select
                value={form.type}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, type: value as ScheduleEventType }))
                }
              >
                <SelectTrigger id="schedule-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="meeting">Meeting</SelectItem>
                  <SelectItem value="call">Call</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Contact / attendees" id="schedule-contact">
              <Input
                id="schedule-contact"
                value={form.contact}
                onChange={(e) => setForm((value) => ({ ...value, contact: e.target.value }))}
                placeholder="Client or attendee name"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Date *" id="schedule-date">
              <Input
                id="schedule-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm((value) => ({ ...value, date: e.target.value }))}
                required
              />
            </Field>
            <Field label="Start time *" id="schedule-time">
              <Input
                id="schedule-time"
                type="time"
                value={form.startTime}
                onChange={(e) => setForm((value) => ({ ...value, startTime: e.target.value }))}
                required
              />
            </Field>
            <Field label="Duration" id="schedule-duration">
              <Select
                value={form.durationMinutes}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, durationMinutes: value }))
                }
              >
                <SelectTrigger id="schedule-duration">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="45">45 minutes</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="90">1.5 hours</SelectItem>
                  <SelectItem value="120">2 hours</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Location" id="schedule-location">
              <Input
                id="schedule-location"
                value={form.location}
                onChange={(e) => setForm((value) => ({ ...value, location: e.target.value }))}
                placeholder="Office, client site, etc."
              />
            </Field>
            <Field label="Meeting link" id="schedule-url">
              <Input
                id="schedule-url"
                type="url"
                value={form.meetingUrl}
                onChange={(e) => setForm((value) => ({ ...value, meetingUrl: e.target.value }))}
                placeholder="https://meet.google.com/..."
              />
            </Field>
          </div>

          <Field label="Remind me" id="schedule-reminder">
            <Select
              value={form.reminderMinutes}
              onValueChange={(value) =>
                setForm((current) => ({ ...current, reminderMinutes: value }))
              }
            >
              <SelectTrigger id="schedule-reminder">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">At start time</SelectItem>
                <SelectItem value="10">10 minutes before</SelectItem>
                <SelectItem value="30">30 minutes before</SelectItem>
                <SelectItem value="60">1 hour before</SelectItem>
                <SelectItem value="1440">1 day before</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Notes" id="schedule-notes">
            <Textarea
              id="schedule-notes"
              value={form.notes}
              onChange={(e) => setForm((value) => ({ ...value, notes: e.target.value }))}
              placeholder="Agenda, preparation notes, phone number..."
              rows={3}
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{event ? "Save changes" : "Create schedule"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
