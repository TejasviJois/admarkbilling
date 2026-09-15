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
import { toLocalISODate } from "@/lib/date-range-filter";
import type { Client, Lead, LeadStatus } from "@/lib/types";

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
  clientMode: "new" as "new" | "existing",
  existingClientId: "",
};

const NONE_SALESPERSON = "__unassigned__";

export function LeadFormDialog({
  open,
  onOpenChange,
  lead,
  clients = [],
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead | null;
  clients?: Client[];
  onSave: (lead: Lead) => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const isEdit = Boolean(lead);
  const members = DEFAULT_COMPANY.companyMembers ?? [];
  const activeClients = clients
    .filter((client) => client.status !== "inactive")
    .slice()
    .sort((a, b) => a.companyName.localeCompare(b.companyName));

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
        clientMode: lead.convertedClientId ? "existing" : "new",
        existingClientId: lead.convertedClientId ?? "",
      });
    } else {
      const in30 = new Date();
      in30.setDate(in30.getDate() + 30);
      setForm({
        ...EMPTY_FORM,
        expectedClosingDate: toLocalISODate(in30),
      });
    }
    setFormError(null);
  }, [open, lead]);

  const applyExistingClient = (clientId: string) => {
    const client = clients.find((entry) => entry.id === clientId);
    if (!client) {
      setForm((f) => ({ ...f, existingClientId: clientId }));
      return;
    }
    setForm((f) => ({
      ...f,
      existingClientId: clientId,
      company: client.companyName,
      contactPerson: client.contactPerson || "",
      email: client.email || "",
      phone: client.phone || "",
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (form.clientMode === "existing" && !form.existingClientId) {
      setFormError("Select an existing client for this deal.");
      return;
    }

    if (!form.company.trim()) {
      setFormError("Company name is required.");
      return;
    }

    if (form.source.trim().toLowerCase() === "directory") {
      setFormError(
        'Lead Source cannot be "Directory" — that label is reserved for the contact book. Use "Contacted" or another source.',
      );
      return;
    }

    const revenueNum = form.expectedRevenue
      ? Number(form.expectedRevenue.replace(/,/g, "").trim())
      : undefined;
    const probabilityNum = form.probability ? Number(form.probability.trim()) : undefined;

    if (revenueNum !== undefined && (Number.isNaN(revenueNum) || revenueNum < 0)) {
      setFormError("Expected Revenue must be a positive number.");
      return;
    }

    if (
      probabilityNum !== undefined &&
      (Number.isNaN(probabilityNum) || probabilityNum < 0 || probabilityNum > 100)
    ) {
      setFormError("Probability must be a percentage between 0 and 100.");
      return;
    }

    const linkedClientId =
      form.clientMode === "existing" ? form.existingClientId.trim() || undefined : undefined;

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
      convertedClientId: linkedClientId,
      createdAt: lead?.createdAt ?? toLocalISODate(),
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
            Choose whether this deal is for an existing client or a new company, then fill in the
            pipeline details.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-sm font-medium text-foreground">Is this an existing client?</p>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="client-mode"
                  checked={form.clientMode === "new"}
                  onChange={() =>
                    setForm((f) => ({
                      ...f,
                      clientMode: "new",
                      existingClientId: "",
                    }))
                  }
                />
                New prospect
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="client-mode"
                  checked={form.clientMode === "existing"}
                  onChange={() => setForm((f) => ({ ...f, clientMode: "existing" }))}
                />
                Existing client&apos;s project
              </label>
            </div>
            {form.clientMode === "new" ? (
              <p className="text-xs text-muted-foreground">
                A Clients profile is created only when this deal reaches Won.
              </p>
            ) : null}
            {form.clientMode === "existing" && (
              <Field label="Select client *" id="crm-existing-client">
                <Select
                  value={form.existingClientId || undefined}
                  onValueChange={applyExistingClient}
                >
                  <SelectTrigger id="crm-existing-client">
                    <SelectValue placeholder="Choose a client…" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeClients.length === 0 ? (
                      <SelectItem value="__none" disabled>
                        No clients yet — create a new client deal first
                      </SelectItem>
                    ) : (
                      activeClients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.companyName}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company / Client Name *" id="crm-company">
              <Input
                id="crm-company"
                value={form.company}
                onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                placeholder="e.g. Acme Corp"
                readOnly={form.clientMode === "existing"}
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
                type="text"
                inputMode="email"
                autoComplete="email"
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
                value={form.assignedSalesperson || NONE_SALESPERSON}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    assignedSalesperson: v === NONE_SALESPERSON ? "" : v,
                  }))
                }
              >
                <SelectTrigger id="crm-salesperson">
                  <SelectValue placeholder="Select partner..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_SALESPERSON}>Unassigned</SelectItem>
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

          {formError ? (
            <p className="text-sm font-medium text-destructive" role="alert">
              {formError}
            </p>
          ) : null}
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
