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
import { LEAD_STATUSES, leadStatusLabel } from "@/lib/lead-utils";
import type { Lead, LeadStatus } from "@/lib/types";

const EMPTY_FORM = {
  name: "",
  business: "",
  phone: "",
  notes: "",
  status: "new" as LeadStatus,
};

export function LeadFormDialog({
  open,
  onOpenChange,
  lead,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead | null;
  onSave: (lead: Lead) => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const isEdit = Boolean(lead);

  useEffect(() => {
    if (!open) return;
    if (lead) {
      setForm({
        name: lead.name,
        business: lead.business,
        phone: lead.phone ?? "",
        notes: lead.notes ?? "",
        status: lead.status,
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [open, lead]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.business.trim()) return;
    const saved: Lead = {
      id: lead?.id ?? crypto.randomUUID(),
      name: form.name.trim(),
      business: form.business.trim(),
      phone: form.phone.trim() || undefined,
      notes: form.notes.trim() || undefined,
      status: form.status,
      createdAt: lead?.createdAt ?? new Date().toISOString(),
    };
    onSave(saved);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(92vh,640px)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit lead" : "Add lead"}</DialogTitle>
          <DialogDescription>Name, business line, and optional phone for outreach tracking.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Name" id="lead-name">
            <Input
              id="lead-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Contact name"
              required
            />
          </Field>
          <Field label="Business / channel" id="lead-business">
            <Input
              id="lead-business"
              value={form.business}
              onChange={(e) => setForm((f) => ({ ...f, business: e.target.value }))}
              placeholder="e.g. WhatsApp — Hardware"
              required
            />
          </Field>
          <Field label="Phone" id="lead-phone">
            <Input
              id="lead-phone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="10-digit mobile"
              inputMode="tel"
            />
          </Field>
          <Field label="Status" id="lead-status">
            <Select
              value={form.status}
              onValueChange={(v) => setForm((f) => ({ ...f, status: v as LeadStatus }))}
            >
              <SelectTrigger id="lead-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAD_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {leadStatusLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Notes" id="lead-notes">
            <Textarea
              id="lead-notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Follow-up notes…"
              rows={3}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{isEdit ? "Save changes" : "Add lead"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
