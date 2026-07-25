import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Edit2, Plus, Search, Trash2 } from "lucide-react";
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
  Field,
  OperationsLoading,
  OperationsPageHeader,
} from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";
import { leadFromContact } from "@/lib/lead-conversion";
import type { Contact, Lead } from "@/lib/types";

export const Route = createFileRoute("/directory")({ component: DirectoryPage });

const EMPTY_FORM = {
  personName: "",
  companyName: "",
  phone: "",
  contactVia: "",
};

function normalizeName(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function openLeadMatchesContact(lead: Lead, contact: Contact): boolean {
  if (lead.status === "won" || lead.status === "lost") return false;
  const person = normalizeName(contact.personName);
  const company = normalizeName(contact.companyName || contact.personName);
  const leadNames = [lead.company, lead.name, lead.contactPerson].map(normalizeName).filter(Boolean);
  return leadNames.some((name) => name === person || name === company);
}

function DirectoryPage() {
  const { ops, persist, loading } = useOperations();
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);

  const contacts = ops.contacts ?? [];

  const visibleContacts = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...contacts].sort((a, b) => a.personName.localeCompare(b.personName));
    if (!q) return sorted;
    return sorted.filter((contact) =>
      [contact.personName, contact.companyName, contact.phone, contact.contactVia].some((value) =>
        value?.toLowerCase().includes(q),
      ),
    );
  }, [contacts, query]);

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (contact: Contact) => {
    setEditing(contact);
    setFormOpen(true);
  };

  const handleSave = (saved: Contact) => {
    const next = editing
      ? contacts.map((contact) => (contact.id === saved.id ? saved : contact))
      : [saved, ...contacts];
    persist({ ...ops, contacts: next });
  };

  const moveToLeads = (contact: Contact) => {
    const openDeals = (ops.leads ?? []).filter((lead) => openLeadMatchesContact(lead, contact));
    if (openDeals.length > 0) {
      if (
        !confirm(
          `${contact.personName} already has ${openDeals.length} open deal(s) in Leads. Add another deal anyway?`,
        )
      ) {
        return;
      }
    } else if (
      !confirm(
        `Add ${contact.personName} to Leads? They stay in the directory so you can open more deals later.`,
      )
    ) {
      return;
    }
    persist({
      ...ops,
      leads: [leadFromContact(contact), ...(ops.leads ?? [])],
    });
  };

  const handleRemove = (contact: Contact) => {
    if (!confirm(`Remove ${contact.personName} from the directory?`)) return;
    persist(
      { ...ops, contacts: contacts.filter((c) => c.id !== contact.id) },
      { deleteIds: { contacts: [contact.id] } },
    );
  };

  if (loading) return <OperationsLoading />;

  return (
    <div className="space-y-6">
      <OperationsPageHeader
        title="Directory"
        description="Your contact book. Add someone to Leads when you start a deal — they stay here for future projects."
        action={
          <Button type="button" onClick={openAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Add contact
          </Button>
        }
      />

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, company, phone…"
          className="pl-9"
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full table-auto border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Contact through</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleContacts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    {query
                      ? "No matches in the directory."
                      : "Directory is empty. Add the people you want to reach out to."}
                  </td>
                </tr>
              ) : (
                visibleContacts.map((contact) => (
                  <tr key={contact.id} className="hover:bg-muted/30">
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-foreground">
                      {contact.personName}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {contact.companyName || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {contact.phone || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {contact.contactVia || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => moveToLeads(contact)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-card px-2.5 text-xs font-medium text-foreground hover:bg-secondary"
                          title="Contacted — move to Leads"
                        >
                          Add to leads
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(contact)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-card text-muted-foreground hover:bg-secondary"
                          title="Edit contact"
                          aria-label="Edit contact"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemove(contact)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-card text-destructive hover:bg-destructive/10"
                          title="Remove from directory"
                          aria-label="Remove from directory"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ContactFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        contact={editing}
        onSave={handleSave}
      />
    </div>
  );
}

function ContactFormDialog({
  open,
  onOpenChange,
  contact,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: Contact | null;
  onSave: (contact: Contact) => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (!open) return;
    setForm(
      contact
        ? {
            personName: contact.personName,
            companyName: contact.companyName ?? "",
            phone: contact.phone ?? "",
            contactVia: contact.contactVia ?? "",
          }
        : EMPTY_FORM,
    );
  }, [open, contact]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const personName = form.personName.trim();
    if (!personName) {
      alert("Please enter the person's name.");
      return;
    }
    if (!form.phone.trim() && !form.contactVia.trim()) {
      alert("Add a phone number — or note who to contact them through.");
      return;
    }
    onSave({
      id: contact?.id ?? `contact-${crypto.randomUUID().slice(0, 8)}`,
      personName,
      companyName: form.companyName.trim() || undefined,
      phone: form.phone.trim() || undefined,
      contactVia: form.contactVia.trim() || undefined,
      createdAt: contact?.createdAt ?? new Date().toISOString().slice(0, 10),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{contact ? "Edit contact" : "Add contact"}</DialogTitle>
          <DialogDescription>
            Just the essentials — when you contact them, move them to Leads.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Person's name *" id="contact-person-name">
            <Input
              id="contact-person-name"
              value={form.personName}
              onChange={(e) => setForm((f) => ({ ...f, personName: e.target.value }))}
              placeholder="e.g. Madhu"
              autoFocus
            />
          </Field>
          <Field label="Company name" id="contact-company-name">
            <Input
              id="contact-company-name"
              value={form.companyName}
              onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
              placeholder="e.g. BG Stones"
            />
          </Field>
          <Field label="Phone number" id="contact-phone">
            <Input
              id="contact-phone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="Direct number, if you have it"
            />
          </Field>
          <Field label="No phone? Who to contact through" id="contact-via">
            <Input
              id="contact-via"
              value={form.contactVia}
              onChange={(e) => setForm((f) => ({ ...f, contactVia: e.target.value }))}
              placeholder="e.g. Prajwal, or their office reception"
            />
          </Field>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{contact ? "Save changes" : "Add to directory"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
