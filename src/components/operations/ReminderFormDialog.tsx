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
  type: "meeting" as ScheduleEvent["type"],
  date: "",
  startTime: "09:00",
  contact: "",
  notes: "",
};

export function ReminderFormDialog({
  open,
  onOpenChange,
  reminder,
  defaultDate,
  defaultType,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reminder: ScheduleEvent | null;
  defaultDate?: string;
  defaultType?: ScheduleEvent["type"];
  onSave: (event: ScheduleEvent) => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (!open) return;
    if (reminder) {
      setForm({
        title: reminder.title,
        type: reminder.type || "reminder",
        date: reminder.date,
        startTime: reminder.startTime || "09:00",
        contact: reminder.contact ?? "",
        notes: reminder.notes ?? "",
      });
      return;
    }
    setForm({
      ...EMPTY_FORM,
      type: defaultType || "meeting",
      date: defaultDate || toLocalISODate(),
    });
  }, [open, reminder, defaultDate, defaultType]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.date) {
      alert("Title and date are required.");
      return;
    }
    const now = Date.now();
    onSave({
      ...(reminder ?? {}),
      id: reminder?.id ?? `sched-${crypto.randomUUID().slice(0, 8)}`,
      title: form.title.trim(),
      type: form.type,
      date: form.date,
      startTime: form.startTime || "09:00",
      durationMinutes: form.type === "meeting" ? 30 : 15,
      contact: form.contact.trim() || undefined,
      notes: form.notes.trim() || undefined,
      reminderMinutes: form.type === "meeting" ? 15 : 12 * 60,
      status: reminder?.status ?? "scheduled",
      createdAt: reminder?.createdAt ?? now,
      updatedAt: now,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-md bg-[#121218] border border-white/10 text-white rounded-2xl overflow-hidden shadow-2xl">
        <DialogHeader className="border-b border-white/10 px-5 py-4 text-left">
          <DialogTitle className="text-base font-bold tracking-tight text-white">
            {reminder ? `Edit ${reminder.type || "Event"}` : `Schedule ${form.type === "meeting" ? "Meeting" : form.type === "call" ? "Call" : "Reminder"}`}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          {/* Type Toggle */}
          <div>
            <label className="text-xs font-semibold text-white/60 mb-1.5 block">Schedule Type</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: "meeting", label: "Meeting", icon: "🤝" },
                { value: "call", label: "Call", icon: "📞" },
                { value: "reminder", label: "Reminder", icon: "⏰" },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, type: item.value as ScheduleEvent["type"] }))}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-semibold transition-all ${
                    form.type === item.value
                      ? "border-[#ff6b2b]/50 bg-gradient-to-r from-[#ff6b2b]/20 to-[#f04400]/20 text-[#ff6b2b] shadow-sm shadow-[#ff6b2b]/20 font-bold"
                      : "border-white/10 bg-white/5 text-white/60 hover:text-white hover:bg-white/10"
                  }`}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
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
                className="h-9 border-white/10 bg-white/5 text-xs text-white focus:border-[#ff6b2b]/50 [color-scheme:dark] rounded-xl"
              />
            </Field>
            <Field label="Time" id="reminder-time">
              <Input
                id="reminder-time"
                type="time"
                value={form.startTime}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                className="h-9 border-white/10 bg-white/5 text-xs text-white focus:border-[#ff6b2b]/50 [color-scheme:dark] rounded-xl"
              />
            </Field>
          </div>
          <Field label="Contact / Person" id="reminder-contact">
            <Input
              id="reminder-contact"
              value={form.contact}
              onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
              placeholder="e.g. Rahul Sharma"
              className="h-9 border-white/10 bg-white/5 text-xs text-white focus:border-[#ff6b2b]/50 placeholder:text-white/40 rounded-xl"
            />
          </Field>
          <Field label="Notes / Meeting Agenda" id="reminder-notes">
            <Textarea
              id="reminder-notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Meeting agenda, discussion points, or zoom link…"
              rows={2}
              className="border-white/10 bg-white/5 text-xs text-white focus:border-[#ff6b2b]/50 placeholder:text-white/40 rounded-xl"
            />
          </Field>
          <DialogFooter className="gap-2 border-t border-white/10 px-0 pb-0 pt-4 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white rounded-xl"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="rounded-xl bg-gradient-to-r from-[#ff6b2b] to-[#f04400] text-white font-bold shadow-md shadow-[#ff6b2b]/25 hover:brightness-110 active:scale-95 transition-all"
            >
              {reminder ? "Save Changes" : `Schedule ${form.type === "meeting" ? "Meeting" : form.type === "call" ? "Call" : "Reminder"}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
