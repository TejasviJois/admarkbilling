import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import { Field } from "@/components/operations/operations-ui";
import { logClientError } from "@/lib/client-logger";
import type { Contact, LeadListEntry } from "@/lib/types";
import { recordSalesWinFn } from "@/server/sales-win-fns";

export type SalesWinSeed = {
  clientName?: string;
  phone?: string;
  email?: string;
  leadListEntryId?: string;
  directoryContactId?: string;
};

function seedFromLead(lead?: LeadListEntry | null): SalesWinSeed {
  if (!lead) return {};
  return {
    clientName: lead.title,
    phone: lead.phone,
    email: lead.email,
    leadListEntryId: lead.id,
  };
}

function seedFromContact(contact?: Contact | null): SalesWinSeed {
  if (!contact) return {};
  const email =
    contact.email?.trim() ||
    (contact.contactVia && /@/.test(contact.contactVia) ? contact.contactVia.trim() : undefined);
  return {
    clientName: contact.companyName?.trim() || contact.personName,
    phone: contact.phone,
    email,
    directoryContactId: contact.id,
  };
}

export function RecordSalesWinDialog({
  open,
  onOpenChange,
  lead,
  contact,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead?: LeadListEntry | null;
  contact?: Contact | null;
  onSaved?: () => void;
}) {
  const [clientName, setClientName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [projectName, setProjectName] = useState("");
  const [closedPrice, setClosedPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [leadListEntryId, setLeadListEntryId] = useState<string | undefined>();
  const [directoryContactId, setDirectoryContactId] = useState<string | undefined>();

  useEffect(() => {
    if (!open) return;
    const seed = lead ? seedFromLead(lead) : seedFromContact(contact);
    setClientName(seed.clientName ?? "");
    setPhone(seed.phone ?? "");
    setEmail(seed.email ?? "");
    setLeadListEntryId(seed.leadListEntryId);
    setDirectoryContactId(seed.directoryContactId);
    setProjectName("");
    setClosedPrice("");
    setNotes("");
  }, [open, lead, contact]);

  const submit = () => {
    if (saving) return;
    const price = Number(closedPrice);
    if (!clientName.trim()) {
      toast.error("Client name is required.");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      toast.error("Enter the closed price you negotiated.");
      return;
    }
    setSaving(true);
    void recordSalesWinFn({
      data: {
        clientName: clientName.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        projectName: projectName.trim() || undefined,
        contractValue: price,
        commissionAmount: 0,
        leadListEntryId,
        directoryContactId,
        notes: notes.trim() || undefined,
      },
    })
      .then(() => {
        toast.success("Win recorded — closed price saved. Admin sets commission in Office & Ops.");
        onOpenChange(false);
        onSaved?.();
      })
      .catch((error) => {
        logClientError("sales.recordWin", error);
        toast.error(error instanceof Error ? error.message : "Could not record win.");
      })
      .finally(() => setSaving(false));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record closed deal</DialogTitle>
          <DialogDescription>
            Enter the price you closed at. Commission is set later by admin — not by sales.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Client name *" id="win-client">
            <Input
              id="win-client"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Company name"
            />
          </Field>
          <Field label="Project name" id="win-project">
            <Input
              id="win-project"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Defaults to client name"
            />
          </Field>
          <Field label="Phone" id="win-phone">
            <Input id="win-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Email" id="win-email">
            <Input id="win-email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Closed price (₹) *" id="win-price">
            <Input
              id="win-price"
              type="number"
              min={0}
              value={closedPrice}
              onChange={(e) => setClosedPrice(e.target.value)}
              placeholder="What you negotiated"
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Deal notes" id="win-notes">
              <Input
                id="win-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What was agreed / scope"
              />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={saving} onClick={submit}>
            {saving ? "Saving…" : "Save win"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
