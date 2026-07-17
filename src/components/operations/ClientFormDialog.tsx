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
import type { Client } from "@/lib/types";

const EMPTY_FORM = {
  parentClientId: "",
  companyName: "",
  contactPerson: "",
  phone: "",
  email: "",
  gstNumber: "",
  pan: "",
  billingAddress: "",
  shippingAddress: "",
  website: "",
  industry: "",
  clientSince: "",
  status: "active" as Client["status"],
  notes: "",
};

export function ClientFormDialog({
  open,
  onOpenChange,
  client,
  clients,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client | null;
  clients: Client[];
  onSave: (client: Client) => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const isEdit = Boolean(client);

  useEffect(() => {
    if (!open) return;
    if (client) {
      setForm({
        parentClientId: client.parentClientId ?? "",
        companyName: client.companyName,
        contactPerson: client.contactPerson,
        phone: client.phone,
        email: client.email,
        gstNumber: client.gstNumber ?? "",
        pan: client.pan ?? "",
        billingAddress: client.billingAddress,
        shippingAddress: client.shippingAddress ?? "",
        website: client.website ?? "",
        industry: client.industry ?? "",
        clientSince: client.clientSince,
        status: client.status,
        notes: client.notes ?? "",
      });
    } else {
      setForm({
        ...EMPTY_FORM,
        clientSince: new Date().toISOString().slice(0, 10),
      });
    }
  }, [open, client]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.companyName.trim() || !form.contactPerson.trim()) {
      alert("Please fill in the required fields (Company Name and Contact Person).");
      return;
    }
    const saved: Client = {
      id: client?.id ?? "cli-" + crypto.randomUUID().slice(0, 8),
      parentClientId: form.parentClientId || undefined,
      companyName: form.companyName.trim(),
      contactPerson: form.contactPerson.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      gstNumber: form.gstNumber.trim() || undefined,
      pan: form.pan.trim() || undefined,
      billingAddress: form.billingAddress.trim(),
      shippingAddress: form.shippingAddress.trim() || undefined,
      website: form.website.trim() || undefined,
      industry: form.industry.trim() || undefined,
      clientSince: form.clientSince,
      status: form.status,
      notes: form.notes.trim() || undefined,
    };
    onSave(saved);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit client profile" : "Add new client"}</DialogTitle>
          <DialogDescription>Create a central profile that houses all associated projects, invoices, and documents.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Relationship / Parent Client" id="client-parent">
              <Select
                value={form.parentClientId || "none"}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    parentClientId: value === "none" ? "" : value,
                  }))
                }
              >
                <SelectTrigger id="client-parent">
                  <SelectValue placeholder="Standalone client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Standalone client</SelectItem>
                  {clients
                    .filter((candidate) => !candidate.parentClientId && candidate.id !== client?.id)
                    .map((candidate) => (
                      <SelectItem key={candidate.id} value={candidate.id}>
                        Under {candidate.companyName}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Company Name *" id="client-companyName">
              <Input
                id="client-companyName"
                value={form.companyName}
                onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                placeholder="e.g. Acme Corp"
                required
              />
            </Field>
            <Field label="Contact Person *" id="client-contactPerson">
              <Input
                id="client-contactPerson"
                value={form.contactPerson}
                onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))}
                placeholder="Full Name"
                required
              />
            </Field>
            <Field label="Email" id="client-email">
              <Input
                id="client-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="client@company.com"
              />
            </Field>
            <Field label="Phone *" id="client-phone">
              <Input
                id="client-phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="Mobile or office phone"
                required
              />
            </Field>
            <Field label="GSTIN" id="client-gst">
              <Input
                id="client-gst"
                value={form.gstNumber}
                onChange={(e) => setForm((f) => ({ ...f, gstNumber: e.target.value }))}
                placeholder="15-digit GSTIN"
              />
            </Field>
            <Field label="PAN" id="client-pan">
              <Input
                id="client-pan"
                value={form.pan}
                onChange={(e) => setForm((f) => ({ ...f, pan: e.target.value }))}
                placeholder="10-digit PAN"
              />
            </Field>
            <Field label="Website" id="client-website">
              <Input
                id="client-website"
                value={form.website}
                onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                placeholder="https://example.com"
              />
            </Field>
            <Field label="Industry" id="client-industry">
              <Input
                id="client-industry"
                value={form.industry}
                onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
                placeholder="e.g. Retail, SaaS"
              />
            </Field>
            <Field label="Client Since" id="client-clientSince">
              <Input
                id="client-clientSince"
                type="date"
                value={form.clientSince}
                onChange={(e) => setForm((f) => ({ ...f, clientSince: e.target.value }))}
                required
              />
            </Field>
            <Field label="Status" id="client-status">
              <Select
                value={form.status}
                onValueChange={(v) => setForm((f) => ({ ...f, status: v as Client["status"] }))}
              >
                <SelectTrigger id="client-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Billing Address" id="client-billingAddress">
            <Textarea
              id="client-billingAddress"
              value={form.billingAddress}
              onChange={(e) => setForm((f) => ({ ...f, billingAddress: e.target.value }))}
              placeholder="Full registered address"
              rows={2}
            />
          </Field>
          <Field label="Shipping Address (Optional)" id="client-shippingAddress">
            <Textarea
              id="client-shippingAddress"
              value={form.shippingAddress}
              onChange={(e) => setForm((f) => ({ ...f, shippingAddress: e.target.value }))}
              placeholder="Leave blank if same as billing"
              rows={2}
            />
          </Field>
          <Field label="Internal Notes" id="client-notes">
            <Textarea
              id="client-notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Relevant client relationship notes…"
              rows={3}
            />
          </Field>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{isEdit ? "Save changes" : "Create client"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
