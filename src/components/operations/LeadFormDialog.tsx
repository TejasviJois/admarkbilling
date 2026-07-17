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
import { DEFAULT_COMPANY } from "@/lib/constants";
import type { Lead, LeadStatus } from "@/lib/types";

const EMPTY_FORM = {
  company: "",
  contactPerson: "",
  email: "",
  phone: "",
  source: "Organic",
  expectedRevenue: "",
  probability: "50",
  expectedClosingDate: "",
  assignedSalesperson: "",
  status: "new_lead" as LeadStatus,
  notes: "",
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
  const members = DEFAULT_COMPANY.companyMembers ?? [];

  useEffect(() => {
    if (!open) return;
    if (lead) {
      setForm({
        company: lead.company || lead.business || "",
        contactPerson: lead.contactPerson || lead.name || "",
        email: lead.email ?? "",
        phone: lead.phone ?? "",
        source: lead.source ?? "Organic",
        expectedRevenue: lead.expectedRevenue != null ? String(lead.expectedRevenue) : "",
        probability: lead.probability != null ? String(lead.probability) : "50",
        expectedClosingDate: lead.expectedClosingDate ?? "",
        assignedSalesperson: lead.assignedSalesperson ?? "",
        status: lead.status,
        notes: lead.notes ?? "",
      });
    } else {
      setForm({
        ...EMPTY_FORM,
        expectedClosingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), // default +30 days
      });
    }
  }, [open, lead]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.company.trim()) {
      alert("Company name is required.");
      return;
    }

    const revenueNum = form.expectedRevenue ? Number(form.expectedRevenue) : undefined;
    const probabilityNum = form.probability ? Number(form.probability) : undefined;

    if (revenueNum !== undefined && (isNaN(revenueNum) || revenueNum < 0)) {
      alert("Expected Revenue must be a positive number.");
      return;
    }

    if (probabilityNum !== undefined && (isNaN(probabilityNum) || probabilityNum < 0 || probabilityNum > 100)) {
      alert("Probability must be a percentage between 0 and 100.");
      return;
    }

    const saved: Lead = {
      ...(lead ?? {}),
      id: lead?.id ?? "lead-" + crypto.randomUUID().slice(0, 8),
      company: form.company.trim(),
      contactPerson: form.contactPerson.trim() || undefined,
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
      source: form.source.trim() || undefined,
      expectedRevenue: revenueNum,
      probability: probabilityNum,
      expectedClosingDate: form.expectedClosingDate || undefined,
      assignedSalesperson: form.assignedSalesperson || undefined,
      status: form.status,
      notes: form.notes.trim() || undefined,
      createdAt: lead?.createdAt ?? new Date().toISOString().slice(0, 10),
    };
    
    onSave(saved);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Lead" : "Add Lead"}</DialogTitle>
          <DialogDescription>
            Enter client information, expected deal size, closing timelines, and pipeline stages.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company / Client Name *" id="crm-company">
              <Input
                id="crm-company"
                value={form.company}
                onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                placeholder="e.g. Acme Corp"
                required
              />
            </Field>

            <Field label="Contact Person" id="crm-contact">
              <Input
                id="crm-contact"
                value={form.contactPerson}
                onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))}
                placeholder="e.g. John Doe"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email Address" id="crm-email">
              <Input
                id="crm-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="e.g. contact@acme.com"
              />
            </Field>

            <Field label="Phone Number" id="crm-phone">
              <Input
                id="crm-phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="e.g. +91 98765 43210"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Expected Revenue (₹)" id="crm-rev">
              <Input
                id="crm-rev"
                type="number"
                value={form.expectedRevenue}
                onChange={(e) => setForm((f) => ({ ...f, expectedRevenue: e.target.value }))}
                placeholder="e.g. 50000"
              />
            </Field>

            <Field label="Win Probability (%)" id="crm-prob">
              <Input
                id="crm-prob"
                type="number"
                min="0"
                max="100"
                value={form.probability}
                onChange={(e) => setForm((f) => ({ ...f, probability: e.target.value }))}
                placeholder="0 - 100"
              />
            </Field>

            <Field label="Lead Source" id="crm-source">
              <Input
                id="crm-source"
                value={form.source}
                onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                placeholder="e.g. LinkedIn, Referral"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Assigned Sales Partner" id="crm-salesperson">
              <Select
                value={form.assignedSalesperson}
                onValueChange={(v) => setForm((f) => ({ ...f, assignedSalesperson: v }))}
              >
                <SelectTrigger id="crm-salesperson">
                  <SelectValue placeholder="Select partner..." />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Expected Closing Date" id="crm-closing">
              <Input
                id="crm-closing"
                type="date"
                value={form.expectedClosingDate}
                onChange={(e) => setForm((f) => ({ ...f, expectedClosingDate: e.target.value }))}
              />
            </Field>
          </div>

          <Field label="Pipeline Stage *" id="crm-status">
            <Select
              value={form.status}
              onValueChange={(v) => setForm((f) => ({ ...f, status: v as LeadStatus }))}
            >
              <SelectTrigger id="crm-status">
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

          <Field label="Deal Notes / Remarks" id="crm-notes">
            <Textarea
              id="crm-notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Initial requirements, context, pricing adjustments..."
              rows={3}
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{isEdit ? "Save Deal" : "Add Deal"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
