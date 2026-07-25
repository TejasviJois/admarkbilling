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
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/operations/operations-ui";
import { toLocalISODate } from "@/lib/date-range-filter";
import type { ScheduleEvent } from "@/lib/types";

const EMPTY_FORM = {
  title: "",
  date: "",
  startTime: "09:00",
  contact: "",
  notes: "",
};

export function ReminderFormDialog({
  open,
  onOpenChange,
  reminder,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reminder: ScheduleEvent | null;
  onSave: (event: ScheduleEvent) => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (!open) return;
    if (reminder) {
      setForm({
        title: reminder.title,
        date: reminder.date,
        startTime: reminder.startTime || "09:00",
        contact: reminder.contact ?? "",
        notes: reminder.notes ?? "",
      });
      return;
    }
    setForm({
      ...EMPTY_FORM,
      date: toLocalISODate(),
    });
  }, [open, reminder]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.date) {
      alert("Title and date are required.");
      return;
    }
    const now = Date.now();
    onSave({
      ...(reminder ?? {}),
      id: reminder?.id ?? `reminder-${crypto.randomUUID().slice(0, 8)}`,
      title: form.title.trim(),
      type: "reminder",
      date: form.date,
      startTime: form.startTime || "09:00",
      durationMinutes: 15,
      contact: form.contact.trim() || undefined,
      notes: form.notes.trim() || undefined,
      // Fire for the whole day starting at the chosen time.
      reminderMinutes: 12 * 60,
      status: reminder?.status ?? "scheduled",
      createdAt: reminder?.createdAt ?? now,
      updatedAt: now,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{reminder ? "Edit reminder" : "Add reminder"}</DialogTitle>
          <DialogDescription>
            For follow-ups like “call this client after August 3rd” — shown on the dashboard and
            Reminders page.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="What to remember *" id="reminder-title">
            <Input
              id="reminder-title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Call Alliance Square about next project"
              required
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Remind me on *" id="reminder-date">
              <Input
                id="reminder-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                required
              />
            </Field>
            <Field label="Around time" id="reminder-time">
              <Input
                id="reminder-time"
                type="time"
                value={form.startTime}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
              />
            </Field>
          </div>
          <Field label="Client / person" id="reminder-contact">
            <Input
              id="reminder-contact"
              value={form.contact}
              onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
              placeholder="Optional"
            />
          </Field>
          <Field label="Notes" id="reminder-notes">
            <Textarea
              id="reminder-notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Context for the follow-up…"
              rows={3}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{reminder ? "Save" : "Add reminder"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
