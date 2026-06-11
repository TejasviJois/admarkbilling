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
import { Field } from "@/components/operations/operations-ui";
import { partnershipStatusLabel } from "@/lib/partnership-status";
import type { Partnership, PartnershipStatus } from "@/lib/types";

const PARTNERSHIP_STATUSES: PartnershipStatus[] = ["active", "prospect", "inactive"];

const EMPTY_FORM = {
  name: "",
  type: "",
  opportunityType: "",
  status: "active" as PartnershipStatus,
};

export function PartnershipFormDialog({
  open,
  onOpenChange,
  partnership,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partnership: Partnership | null;
  onSave: (partnership: Partnership) => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const isEdit = Boolean(partnership);

  useEffect(() => {
    if (!open) return;
    if (partnership) {
      setForm({
        name: partnership.name,
        type: partnership.type || "",
        opportunityType: partnership.opportunityType || "",
        status: partnership.status,
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [open, partnership]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const saved: Partnership = {
      id: partnership?.id ?? crypto.randomUUID(),
      name: form.name.trim(),
      type: form.type.trim() || undefined,
      opportunityType: form.opportunityType.trim() || undefined,
      status: form.status,
      contact: partnership?.contact,
      notes: partnership?.notes,
    };
    onSave(saved);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,640px)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit partnership" : "New partnership"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update partner details, type, or status."
              : "Add a partner agency or collaborator to your pipeline."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <Field label="Partner name" id="dialog-partner-name">
            <Input
              id="dialog-partner-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Partner / agency"
              required
            />
          </Field>
          <Field label="Type" id="dialog-partner-type">
            <Input
              id="dialog-partner-type"
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              placeholder="Marketing Agency, Development Agency…"
            />
          </Field>
          <Field label="Opportunity type" id="dialog-partner-opp">
            <Input
              id="dialog-partner-opp"
              value={form.opportunityType}
              onChange={(e) => setForm((f) => ({ ...f, opportunityType: e.target.value }))}
              placeholder="Project Based, Hourly-based…"
            />
          </Field>
          <Field label="Status" id="dialog-partner-status">
            <Select
              value={form.status}
              onValueChange={(v) => setForm((f) => ({ ...f, status: v as PartnershipStatus }))}
            >
              <SelectTrigger id="dialog-partner-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PARTNERSHIP_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {partnershipStatusLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{isEdit ? "Save changes" : "Add partnership"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
