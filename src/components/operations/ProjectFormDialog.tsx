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
import { buildRevenueValueFromBilling, resolveProjectBilling } from "@/lib/project-billing";
import { projectStatusLabel } from "@/lib/project-status";
import { useOperations } from "@/hooks/use-operations";
import { DEFAULT_COMPANY } from "@/lib/constants";
import type { Project, ProjectBilling, ProjectStatus, Milestone } from "@/lib/types";
import { Trash2, PlusCircle } from "lucide-react";

const PROJECT_STATUSES: ProjectStatus[] = [
  "completed",
  "active",
  "planning",
  "on_hold",
  "cancelled",
];

const PRIORITIES = [
  { value: "low", label: "Low Priority" },
  { value: "medium", label: "Medium Priority" },
  { value: "high", label: "High Priority" },
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
  estimatedCost: "",
  priority: "medium" as "low" | "medium" | "high",
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
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  
  // Milestone Sub-form state
  const [msName, setMsName] = useState("");
  const [msDesc, setMsDesc] = useState("");
  const [msDueDate, setMsDueDate] = useState("");
  const [msUser, setMsUser] = useState("");
  const [msTrigger, setMsTrigger] = useState(false);
  const [msStatus, setMsStatus] = useState<Milestone["status"]>("pending");

  const isEdit = Boolean(project);

  const { ops } = useOperations();
  const clients = ops.clients ?? [];
  const members = DEFAULT_COMPANY.companyMembers ?? [];

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
        estimatedCost: project.estimatedCost != null ? String(project.estimatedCost) : "",
        priority: project.priority ?? "medium",
        startDate: project.startDate ?? "",
        deadline: project.deadline ?? "",
        budget: project.budget != null ? String(project.budget) : "",
        notes: project.notes ?? "",
        ...billingFromProject(project),
      });
      setMilestones(project.milestones ?? []);
    } else {
      setForm({
        ...EMPTY_FORM,
        startDate: new Date().toISOString().slice(0, 10),
      });
      setMilestones([]);
    }
    // Clear milestone sub-form
    setMsName("");
    setMsDesc("");
    setMsDueDate("");
    setMsUser("");
    setMsTrigger(false);
    setMsStatus("pending");
  }, [open, project, clients]);

  const handleAddMilestone = () => {
    if (!msName.trim()) {
      alert("Milestone name is required.");
      return;
    }
    const newMs: Milestone = {
      id: "ms-" + crypto.randomUUID().slice(0, 8),
      name: msName.trim(),
      description: msDesc.trim() || undefined,
      dueDate: msDueDate || undefined,
      status: msStatus,
      paymentTrigger: msTrigger,
      assignedUser: msUser || undefined,
      completedDate: msStatus === "completed" ? new Date().toISOString().slice(0, 10) : undefined,
    };
    setMilestones([...milestones, newMs]);
    
    // Reset sub-form
    setMsName("");
    setMsDesc("");
    setMsDueDate("");
    setMsUser("");
    setMsTrigger(false);
    setMsStatus("pending");
  };

  const handleRemoveMilestone = (id: string) => {
    setMilestones(milestones.filter((m) => m.id !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.client.trim()) return;
    const billing = buildBilling(form);
    
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
      name: form.client.trim(),
      projectType: form.projectType.trim() || undefined,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      status: form.status,
      billing,
      revenueValue: billing ? buildRevenueValueFromBilling(billing) : project?.revenueValue,
      budget: budgetNum,
      estimatedCost: form.estimatedCost ? Number(form.estimatedCost) : undefined,
      priority: form.priority,
      startDate: form.startDate || undefined,
      deadline: form.deadline || undefined,
      notes: form.notes.trim() || undefined,
      milestones,
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
            Configure project specifications, billing, priority, and timeline milestones.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Section: Client & Profile */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground border-b border-border pb-1">1. Client Profile</h3>
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

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Client Name" id="dialog-client-name">
                <Input
                  id="dialog-client-name"
                  value={form.client}
                  readOnly
                  className="bg-muted/40 cursor-default"
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
            <h3 className="text-sm font-semibold text-foreground border-b border-border pb-1">2. Project Metadata</h3>
            
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

              <Field label="Priority" id="dialog-priority">
                <Select
                  value={form.priority}
                  onValueChange={(v) => setForm((f) => ({ ...f, priority: v as "low" | "medium" | "high" }))}
                >
                  <SelectTrigger id="dialog-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                  placeholder="Milestone 1"
                />
              </Field>
            </div>
          </div>

          {/* Section: Milestones Builder */}
          <div className="space-y-4 rounded-lg border border-border bg-muted/10 p-4">
            <h3 className="text-sm font-semibold text-foreground border-b border-border pb-1">3. Project Milestones</h3>
            
            {/* Added Milestones list */}
            {milestones.length > 0 ? (
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {milestones.map((ms) => (
                  <div key={ms.id} className="flex items-center justify-between rounded border border-border bg-card p-2 text-xs">
                    <div>
                      <p className="font-semibold text-foreground">
                        {ms.name}
                        {ms.paymentTrigger && <span className="ml-1.5 text-[9px] bg-amber-500/10 text-amber-500 font-bold px-1 py-0.5 rounded">Payment Trigger</span>}
                      </p>
                      {ms.dueDate && <p className="text-[10px] text-muted-foreground mt-0.5">Due: {ms.dueDate}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold">{ms.status}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveMilestone(ms.id)}
                        className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4.5 w-4.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic text-center py-2">No milestones configured for this project yet.</p>
            )}

            {/* Quick add milestone sub-form */}
            <div className="border-t border-dashed border-border pt-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Configure New Milestone</p>
              
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Milestone Name" id="ms-new-name">
                  <Input
                    id="ms-new-name"
                    value={msName}
                    onChange={(e) => setMsName(e.target.value)}
                    placeholder="e.g. Wireframes Sign-off"
                  />
                </Field>
                <Field label="Due Date" id="ms-new-due">
                  <Input
                    id="ms-new-due"
                    type="date"
                    value={msDueDate}
                    onChange={(e) => setMsDueDate(e.target.value)}
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Status" id="ms-new-status">
                  <Select
                    value={msStatus}
                    onValueChange={(v) => setMsStatus(v as Milestone["status"])}
                  >
                    <SelectTrigger id="ms-new-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="delayed">Delayed</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                
                <Field label="Assigned Partner" id="ms-new-user">
                  <Select
                    value={msUser}
                    onValueChange={(v) => setMsUser(v)}
                  >
                    <SelectTrigger id="ms-new-user">
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

                <div className="flex items-center h-full pt-6">
                  <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={msTrigger}
                      onChange={(e) => setMsTrigger(e.target.checked)}
                      className="rounded border-input text-primary focus:ring-primary"
                    />
                    Payment Trigger?
                  </label>
                </div>
              </div>

              <Field label="Milestone Description" id="ms-new-desc">
                <Input
                  id="ms-new-desc"
                  value={msDesc}
                  onChange={(e) => setMsDesc(e.target.value)}
                  placeholder="Scope of work details..."
                />
              </Field>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddMilestone}
                className="w-full inline-flex items-center justify-center gap-1.5"
              >
                <PlusCircle className="h-4 w-4 text-primary" /> Add Milestone to List
              </Button>
            </div>
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
