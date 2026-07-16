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
import { buildRevenueValueFromBilling, resolveProjectBilling } from "@/lib/project-billing";
import { projectStatusLabel } from "@/lib/project-status";
import { useOperations } from "@/hooks/use-operations";
import type { Project, ProjectBilling, ProjectStatus } from "@/lib/types";

const PROJECT_STATUSES: ProjectStatus[] = [
  "completed",
  "active",
  "planning",
  "on_hold",
  "cancelled",
];

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
  projectType: "",
  phone: "",
  email: "",
  status: "active" as ProjectStatus,
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
  const isEdit = Boolean(project);

  const { ops } = useOperations();
  const clients = ops.clients ?? [];

  useEffect(() => {
    if (!open) return;
    if (project) {
      setForm({
        clientId: project.clientId ?? "",
        client: project.client || project.name || "",
        projectType: project.projectType || "",
        phone: project.phone ?? "",
        email: project.email ?? "",
        status: project.status,
        ...billingFromProject(project),
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [open, project, clients]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.client.trim()) return;
    const billing = buildBilling(form);
    const saved: Project = {
      ...(project ?? {}),
      id: project?.id ?? crypto.randomUUID(),
      clientId: form.clientId.trim() || undefined,
      client: form.client.trim(),
      name: form.client.trim(),
      projectType: form.projectType.trim() || undefined,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      status: form.status,
      billing,
      revenueValue: billing ? buildRevenueValueFromBilling(billing) : project?.revenueValue,
    };
    onSave(saved);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,720px)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit project" : "New project"}</DialogTitle>
          <DialogDescription>
            Set upfront and monthly billing separately. Monthly retainers only count in revenue
            after you set a start date.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <Field label="Select Client *" id="dialog-client">
            <Select
              value={form.clientId}
              onValueChange={(v) => {
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
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.companyName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Client name" id="dialog-client-name">
            <Input
              id="dialog-client-name"
              value={form.client}
              readOnly
              className="bg-muted/40 cursor-default"
            />
          </Field>
          <Field label="Project type" id="dialog-type">
            <Input
              id="dialog-type"
              value={form.projectType}
              onChange={(e) => setForm((f) => ({ ...f, projectType: e.target.value }))}
              placeholder="Website, CRM, Dashboard…"
            />
          </Field>
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
          <Field label="Status" id="dialog-status">
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

          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Billing structure
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Upfront / project cost (₹)" id="dialog-upfront">
                <Input
                  id="dialog-upfront"
                  type="number"
                  min={0}
                  value={form.upfrontAmount}
                  onChange={(e) => setForm((f) => ({ ...f, upfrontAmount: e.target.value }))}
                  placeholder="One-time project cost"
                />
              </Field>
              <Field label="Maintenance lump sum (₹)" id="dialog-maintenance">
                <Input
                  id="dialog-maintenance"
                  type="number"
                  min={0}
                  value={form.maintenanceAmount}
                  onChange={(e) => setForm((f) => ({ ...f, maintenanceAmount: e.target.value }))}
                  placeholder="e.g. 14000 for 2 months"
                />
              </Field>
              <Field label="Maintenance duration (months)" id="dialog-maintenance-months">
                <Input
                  id="dialog-maintenance-months"
                  type="number"
                  min={1}
                  value={form.maintenanceMonths}
                  onChange={(e) => setForm((f) => ({ ...f, maintenanceMonths: e.target.value }))}
                  placeholder="e.g. 2"
                />
              </Field>
              <Field label="Monthly retainer (₹)" id="dialog-monthly">
                <Input
                  id="dialog-monthly"
                  type="number"
                  min={0}
                  value={form.monthlyAmount}
                  onChange={(e) => setForm((f) => ({ ...f, monthlyAmount: e.target.value }))}
                  placeholder="e.g. 10000"
                />
              </Field>
              <Field label="Fixed months" id="dialog-months">
                <Input
                  id="dialog-months"
                  type="number"
                  min={1}
                  value={form.monthlyMonths}
                  onChange={(e) => setForm((f) => ({ ...f, monthlyMonths: e.target.value }))}
                  placeholder="Leave empty if ongoing"
                />
              </Field>
              <Field label="Monthly starts on" id="dialog-start">
                <Input
                  id="dialog-start"
                  type="date"
                  value={form.monthlyStartDate}
                  onChange={(e) => setForm((f) => ({ ...f, monthlyStartDate: e.target.value }))}
                />
              </Field>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Monthly-only projects (e.g. Safe Wheels, Spice Trip) stay out of booked revenue until
              you set a start date. Hybrid projects count upfront immediately; monthly counts after
              start.
            </p>
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">
            Record actual payments from the projects table — each installment needs a screenshot.
          </p>
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
