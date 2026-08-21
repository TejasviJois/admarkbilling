import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
      reminderMinutes: 12 * 60,
      status: reminder?.status ?? "scheduled",
      createdAt: reminder?.createdAt ?? now,
      updatedAt: now,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-sm">
        <DialogHeader className="border-b border-border/80 px-5 py-4 text-left">
          <DialogTitle className="text-base font-semibold tracking-tight">
            {reminder ? "Edit reminder" : "New reminder"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          <Field label="What to remember" id="reminder-title">
            <Input
              id="reminder-title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Call Alliance Square"
              required
              className="h-9 border-border/80"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date" id="reminder-date">
              <Input
                id="reminder-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                required
                className="h-9 border-border/80"
              />
            </Field>
            <Field label="Time" id="reminder-time">
              <Input
                id="reminder-time"
                type="time"
                value={form.startTime}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                className="h-9 border-border/80"
              />
            </Field>
          </div>
          <Field label="Person" id="reminder-contact">
            <Input
              id="reminder-contact"
              value={form.contact}
              onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
              placeholder="Optional"
              className="h-9 border-border/80"
            />
          </Field>
          <Field label="Notes" id="reminder-notes">
            <Textarea
              id="reminder-notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Context…"
              rows={2}
              className="border-border/80"
            />
          </Field>
          <DialogFooter className="gap-1.5 border-t border-border/80 px-0 pb-0 pt-4 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-border/80"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm">
              {reminder ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
