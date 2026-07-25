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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/operations/operations-ui";
import { buildRevenueValueFromBilling, resolveProjectBilling } from "@/lib/project-billing";
import { projectStatusLabel } from "@/lib/project-status";
import { useOperations } from "@/hooks/use-operations";
import { useCompany } from "@/hooks/use-company";
import type { Client, Project, ProjectBilling, ProjectStatus } from "@/lib/types";

const PROJECT_STATUSES: ProjectStatus[] = [
  "completed",
  "active",
  "planning",
  "on_hold",
  "cancelled",
];

/** Sentinel option in the client dropdown — enables free-typed new clients. */
const NEW_CLIENT_VALUE = "__new-client__";

type BillingForm = {
  upfrontAmount: string;
  maintenanceAmount: string;
  maintenanceMonths: string;
  monthlyAmount: string;
  monthlyMonths: string;
  monthlyStartDate: string;
};

const EMPTY_BILLING: BillingForm = {
  upfrontAmount: "",
  maintenanceAmount: "",
  maintenanceMonths: "",
  monthlyAmount: "",
  monthlyMonths: "",
  monthlyStartDate: "",
};

const EMPTY_FORM = {
  clientId: "",
  client: "",
  name: "",
  projectType: "",
  phone: "",
  email: "",
  status: "active" as ProjectStatus,
  estimatedCost: "",
  assignedMembers: [] as string[],
  startDate: "",
  deadline: "",
  budget: "",
  notes: "",
  ...EMPTY_BILLING,
};

function billingFromProject(project: Project): BillingForm {
  const b = resolveProjectBilling(project);
  return {
    upfrontAmount: b.upfrontAmount != null ? String(b.upfrontAmount) : "",
    maintenanceAmount: b.maintenanceAmount != null ? String(b.maintenanceAmount) : "",
    maintenanceMonths: b.maintenanceMonths != null ? String(b.maintenanceMonths) : "",
    monthlyAmount: b.monthlyAmount != null ? String(b.monthlyAmount) : "",
    monthlyMonths: b.monthlyMonths != null ? String(b.monthlyMonths) : "",
    monthlyStartDate: b.monthlyStartDate ?? "",
  };
}

function buildBilling(form: typeof EMPTY_FORM): ProjectBilling | undefined {
  const billing: ProjectBilling = {};
  if (form.upfrontAmount.trim()) billing.upfrontAmount = Number(form.upfrontAmount);
  if (form.maintenanceAmount.trim()) billing.maintenanceAmount = Number(form.maintenanceAmount);
  if (form.maintenanceMonths.trim()) billing.maintenanceMonths = Number(form.maintenanceMonths);
  if (form.monthlyAmount.trim()) billing.monthlyAmount = Number(form.monthlyAmount);
  if (form.monthlyMonths.trim()) billing.monthlyMonths = Number(form.monthlyMonths);
  if (form.monthlyStartDate.trim()) billing.monthlyStartDate = form.monthlyStartDate.trim();

  const hasValue =
    billing.upfrontAmount != null ||
    billing.maintenanceAmount != null ||
    billing.monthlyAmount != null ||
    billing.monthlyStartDate != null;
  return hasValue ? billing : undefined;
}

export function ProjectFormDialog({
  open,
  onOpenChange,
  project,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
  onSave: (project: Project) => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [recurringEnabled, setRecurringEnabled] = useState(false);

  const isEdit = Boolean(project);

  const { ops } = useOperations();
  const { company } = useCompany();
  const clients = ops.clients ?? [];
  const clientLabel = (client: Client) => {
    const parent = client.parentClientId
      ? clients.find((candidate) => candidate.id === client.parentClientId)
      : undefined;
    return parent ? `${client.companyName} — ${parent.companyName}` : client.companyName;
  };
  const selectableClients = [...clients].sort((a, b) =>
    clientLabel(a).localeCompare(clientLabel(b)),
  );
  const members = (company.companyMembers ?? []).filter((member) => member.status !== "inactive");

  useEffect(() => {
    if (!open) return;
    if (project) {
      const billingForm = billingFromProject(project);
      setForm({
        clientId: project.clientId ?? "",
        client: project.client || project.name || "",
        name: project.name || "",
        projectType: project.projectType || "",
        phone: project.phone ?? "",
        email: project.email ?? "",
        status: project.status,
        estimatedCost: project.estimatedCost != null ? String(project.estimatedCost) : "",
        assignedMembers: project.assignedMembers?.length
          ? project.assignedMembers
          : project.assignedPartner
            ? [project.assignedPartner]
            : [],
        startDate: project.startDate ?? "",
        deadline: project.deadline ?? "",
        budget: project.budget != null ? String(project.budget) : "",
        notes: project.notes ?? "",
        ...billingForm,
      });
      setRecurringEnabled(Boolean(billingForm.monthlyAmount.trim()));
    } else {
      setForm({
        ...EMPTY_FORM,
        startDate: new Date().toISOString().slice(0, 10),
      });
      setRecurringEnabled(false);
    }
  }, [open, project, clients]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.client.trim()) return;
    // Toggle off = no recurring income: whatever is typed in those fields is discarded.
    const effectiveForm = recurringEnabled
      ? form
      : {
          ...form,
          monthlyAmount: "",
          monthlyMonths: "",
          monthlyStartDate: "",
          maintenanceAmount: "",
          maintenanceMonths: "",
        };
    const built = buildBilling(effectiveForm);
    // Fields not editable in this form must survive a save: the authoritative
    // Ground Zero contract value and a permanently-closed retainer marker.
    const preserved = project?.billing;
    const billing: ProjectBilling | undefined =
      built ||
      preserved?.contractValue != null ||
      preserved?.monthlyEndDate != null ||
      preserved?.maintenanceAmount != null
        ? {
            ...(built ?? {}),
            ...(preserved?.contractValue != null ? { contractValue: preserved.contractValue } : {}),
            ...(preserved?.monthlyEndDate != null
              ? { monthlyEndDate: preserved.monthlyEndDate }
              : {}),
            // Maintenance is no longer editable here — keep any existing values.
            ...(preserved?.maintenanceAmount != null
              ? { maintenanceAmount: preserved.maintenanceAmount }
              : {}),
            ...(preserved?.maintenanceMonths != null
              ? { maintenanceMonths: preserved.maintenanceMonths }
              : {}),
          }
        : undefined;

    // Automatically calculate default budget if not explicitly set
    let budgetNum = form.budget ? Number(form.budget) : undefined;
    if (budgetNum === undefined && billing) {
      budgetNum = (billing.upfrontAmount ?? 0) + (billing.maintenanceAmount ?? 0);
    }

    const saved: Project = {
      ...(project ?? {}),
      id: project?.id ?? crypto.randomUUID(),
      clientId: form.clientId.trim() || undefined,
      client: form.client.trim(),
      name: form.name.trim() || form.client.trim(),
      projectType: form.projectType.trim() || undefined,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      status: form.status,
      billing,
      revenueValue: billing ? buildRevenueValueFromBilling(billing) : project?.revenueValue,
      budget: budgetNum,
      estimatedCost: form.estimatedCost ? Number(form.estimatedCost) : undefined,
      assignedMembers: form.assignedMembers.length ? form.assignedMembers : undefined,
      assignedPartner: form.assignedMembers[0],
      startDate: form.startDate || undefined,
      deadline: form.deadline || undefined,
      notes: form.notes.trim() || undefined,
    };
    onSave(saved);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit project" : "New project"}</DialogTitle>
          <DialogDescription>
            Configure client, project details, timeline, and billing.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section: Client & Profile */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground border-b border-border pb-1">
              1. Client Profile
            </h3>
            <Field label="Client" id="dialog-client">
              <Select
                value={form.clientId || NEW_CLIENT_VALUE}
                onValueChange={(v) => {
                  if (v === NEW_CLIENT_VALUE) {
                    setForm((f) => ({ ...f, clientId: "", client: "", phone: "", email: "" }));
                    return;
                  }
                  const found = clients.find((c) => c.id === v);
                  if (found) {
                    setForm((f) => ({
                      ...f,
                      clientId: v,
                      client: found.companyName,
                      phone: found.phone,
                      email: found.email,
                    }));
                  }
                }}
              >
                <SelectTrigger id="dialog-client">
                  <SelectValue placeholder="Select client or create new" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NEW_CLIENT_VALUE}>+ New client (type name below)</SelectItem>
                  {selectableClients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {clientLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {!form.clientId && (
              <Field label="New Client Name *" id="dialog-client-name">
                <Input
                  id="dialog-client-name"
                  value={form.client}
                  onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))}
                  placeholder="A client record is created on save and reused everywhere"
                />
              </Field>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Project Display Name" id="dialog-project-name">
                <Input
                  id="dialog-project-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Defaults to the client name"
                />
              </Field>
              <Field label="Project Type" id="dialog-type">
                <Input
                  id="dialog-type"
                  value={form.projectType}
                  onChange={(e) => setForm((f) => ({ ...f, projectType: e.target.value }))}
                  placeholder="Website, Performance Marketing…"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone" id="dialog-project-phone">
                <Input
                  id="dialog-project-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+91 98765 43210"
                />
              </Field>
              <Field label="Email" id="dialog-project-email">
                <Input
                  id="dialog-project-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="client@company.com"
                />
              </Field>
            </div>
          </div>

          {/* Section: Project Setup (Timeline, Priority & Budget) */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground border-b border-border pb-1">
              2. Project Metadata
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Project Status" id="dialog-status">
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm((f) => ({ ...f, status: v as ProjectStatus }))}
                >
                  <SelectTrigger id="dialog-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {projectStatusLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Team Members" id="dialog-partner">
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {members.map((m) => {
                    const isOn = form.assignedMembers.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        aria-pressed={isOn}
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            assignedMembers: isOn
                              ? f.assignedMembers.filter((id) => id !== m.id)
                              : [...f.assignedMembers, m.id],
                          }))
                        }
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                          isOn
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                        }`}
                      >
                        {m.name.trim().split(/\s+/)[0]}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start Date" id="dialog-start-date">
                <Input
                  id="dialog-start-date"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              </Field>
              <Field label="Deadline" id="dialog-deadline">
                <Input
                  id="dialog-deadline"
                  type="date"
                  value={form.deadline}
                  onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Project Budget (₹)" id="dialog-budget">
                <Input
                  id="dialog-budget"
                  type="number"
                  min={0}
                  value={form.budget}
                  onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))}
                  placeholder="Total budget value"
                />
              </Field>
              <Field label="Estimated Cost (₹)" id="dialog-est-cost">
                <Input
                  id="dialog-est-cost"
                  type="number"
                  min={0}
                  value={form.estimatedCost}
                  onChange={(e) => setForm((f) => ({ ...f, estimatedCost: e.target.value }))}
                  placeholder="External contractor, hosting..."
                />
              </Field>
              <Field label="Upfront billing (₹)" id="dialog-upfront">
                <Input
                  id="dialog-upfront"
                  type="number"
                  min={0}
                  value={form.upfrontAmount}
                  onChange={(e) => setForm((f) => ({ ...f, upfrontAmount: e.target.value }))}
                  placeholder="One-time amount"
                />
              </Field>
            </div>
          </div>

          {/* Section: Recurring billing — drives the Revenue label in the projects table */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-1">
              <h3 className="text-sm font-semibold text-foreground">3. Recurring Billing</h3>
              <label
                htmlFor="dialog-recurring-toggle"
                className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground"
              >
                Recurring income
                <Switch
                  id="dialog-recurring-toggle"
                  checked={recurringEnabled}
                  onCheckedChange={setRecurringEnabled}
                />
              </label>
            </div>

            {!recurringEnabled && (
              <p className="text-xs text-muted-foreground">
                Turn the switch on if this project has recurring income — a monthly retainer or
                maintenance billing.
              </p>
            )}

            {recurringEnabled && (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Monthly amount (₹)" id="dialog-monthly-amount">
                    <Input
                      id="dialog-monthly-amount"
                      type="number"
                      min={0}
                      value={form.monthlyAmount}
                      onChange={(e) => setForm((f) => ({ ...f, monthlyAmount: e.target.value }))}
                      placeholder="e.g. 10000"
                    />
                  </Field>
                  <Field label="Number of months" id="dialog-monthly-months">
                    <Input
                      id="dialog-monthly-months"
                      type="number"
                      min={0}
                      value={form.monthlyMonths}
                      onChange={(e) => setForm((f) => ({ ...f, monthlyMonths: e.target.value }))}
                      placeholder="Blank = ongoing"
                    />
                  </Field>
                  <Field label="Billing starts" id="dialog-monthly-start">
                    <Input
                      id="dialog-monthly-start"
                      type="date"
                      value={form.monthlyStartDate}
                      onChange={(e) => setForm((f) => ({ ...f, monthlyStartDate: e.target.value }))}
                    />
                  </Field>
                </div>
              </>
            )}
          </div>

          <Field label="Internal Remarks / Notes" id="dialog-project-notes">
            <Textarea
              id="dialog-project-notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Private details, contracts, URLs…"
              rows={2}
            />
          </Field>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{isEdit ? "Save changes" : "Add project"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
