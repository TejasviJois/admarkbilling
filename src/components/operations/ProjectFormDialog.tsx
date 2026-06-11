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
import { buildRevenueValueFromBilling } from "@/lib/project-billing";
import { projectStatusLabel } from "@/lib/project-status";
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
  monthlyAmount: string;
  monthlyMonths: string;
  monthlyStartDate: string;
};

const EMPTY_BILLING: BillingForm = {
  upfrontAmount: "",
  monthlyAmount: "",
  monthlyMonths: "",
  monthlyStartDate: "",
};

const EMPTY_FORM = {
  client: "",
  projectType: "",
  status: "active" as ProjectStatus,
  ...EMPTY_BILLING,
};

function billingFromProject(project: Project): BillingForm {
  const b = project.billing ?? {};
  return {
    upfrontAmount: b.upfrontAmount != null ? String(b.upfrontAmount) : "",
    monthlyAmount: b.monthlyAmount != null ? String(b.monthlyAmount) : "",
    monthlyMonths: b.monthlyMonths != null ? String(b.monthlyMonths) : "",
    monthlyStartDate: b.monthlyStartDate ?? "",
  };
}

function buildBilling(form: typeof EMPTY_FORM): ProjectBilling | undefined {
  const billing: ProjectBilling = {};
  if (form.upfrontAmount.trim()) billing.upfrontAmount = Number(form.upfrontAmount);
  if (form.monthlyAmount.trim()) billing.monthlyAmount = Number(form.monthlyAmount);
  if (form.monthlyMonths.trim()) billing.monthlyMonths = Number(form.monthlyMonths);
  if (form.monthlyStartDate.trim()) billing.monthlyStartDate = form.monthlyStartDate.trim();

  const hasValue =
    billing.upfrontAmount != null ||
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

  useEffect(() => {
    if (!open) return;
    if (project) {
      setForm({
        client: project.client || project.name || "",
        projectType: project.projectType || "",
        status: project.status,
        ...billingFromProject(project),
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [open, project]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.client.trim()) return;
    const billing = buildBilling(form);
    const saved: Project = {
      id: project?.id ?? crypto.randomUUID(),
      client: form.client.trim(),
      name: form.client.trim(),
      projectType: form.projectType.trim() || undefined,
      status: form.status,
      billing,
      revenueValue: billing ? buildRevenueValueFromBilling(billing) : undefined,
      payments: project?.payments,
      paymentProofs: project?.paymentProofs,
      paymentStatus: project?.paymentStatus,
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
          <Field label="Client name" id="dialog-client">
            <Input
              id="dialog-client"
              value={form.client}
              onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))}
              placeholder="Client name"
              required
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
              <Field label="Upfront (₹)" id="dialog-upfront">
                <Input
                  id="dialog-upfront"
                  type="number"
                  min={0}
                  value={form.upfrontAmount}
                  onChange={(e) => setForm((f) => ({ ...f, upfrontAmount: e.target.value }))}
                  placeholder="One-time payment"
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
