import { useState, useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Calendar,
  DollarSign,
  TrendingUp,
  Percent,
  CheckCircle2,
  Clock,
  User,
  PlusCircle,
  Trash2,
  Briefcase,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";
import { formatINR, formatINRWhole } from "@/lib/invoice-calc";
import { projectStatusBadgeClass, projectStatusLabel } from "@/lib/project-status";
import { DEFAULT_COMPANY } from "@/lib/constants";
import type { Project, Milestone, Transaction } from "@/lib/types";

export const Route = createFileRoute("/projects/$id")({ component: ProjectDetailsPage });

function ProjectDetailsPage() {
  const { id } = Route.useParams();
  const { ops, persist, loading } = useOperations();
  const navigate = useNavigate();

  // Milestone sub-form state
  const [msName, setMsName] = useState("");
  const [msDesc, setMsDesc] = useState("");
  const [msDueDate, setMsDueDate] = useState("");
  const [msUser, setMsUser] = useState("");
  const [msTrigger, setMsTrigger] = useState(false);
  const [msStatus, setMsStatus] = useState<Milestone["status"]>("pending");

  const project = useMemo(() => {
    return ops.projects.find((p) => p.id === id) || null;
  }, [ops.projects, id]);

  const members = DEFAULT_COMPANY.companyMembers ?? [];
  const transactions = ops.transactions ?? [];

  // 1. Calculations
  const calculations = useMemo(() => {
    if (!project) return null;

    const budget = project.budget || 0;

    // Received (From Transactions where type = client_payment / refund)
    const projectTxs = transactions.filter((t) => t.relatedProjectId === project.id);
    const received = projectTxs
      .filter((t) => t.type === "client_payment")
      .reduce((sum, t) => sum + t.amount, 0);

    const pending = Math.max(0, budget - received);

    // Internal Expenses (From Transactions where type = expense)
    const internalExpenses = projectTxs
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);

    const estimatedCost = project.estimatedCost || 0;

    // Profit = Budget - Internal Expenses - Estimated Cost
    const profit = budget - internalExpenses - estimatedCost;

    // Profit % = Profit / Budget * 100
    const profitMargin = budget > 0 ? (profit / budget) * 100 : 0;

    // Milestones completion
    const ms = project.milestones ?? [];
    let completionPercentage = 0;
    if (ms.length > 0) {
      const completed = ms.filter((m) => m.status === "completed").length;
      completionPercentage = Math.round((completed / ms.length) * 100);
    } else {
      // Fallback status-based completion
      if (project.status === "completed") completionPercentage = 100;
      else if (project.status === "active") completionPercentage = 50;
      else if (project.status === "on_hold") completionPercentage = 25;
      else completionPercentage = 0;
    }

    return {
      budget,
      received,
      pending,
      internalExpenses,
      estimatedCost,
      profit,
      profitMargin,
      completionPercentage,
      projectTxs,
    };
  }, [project, transactions]);

  if (loading) return <OperationsLoading />;
  if (!project || !calculations) {
    return (
      <div className="space-y-4 p-8 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
        <h2 className="text-xl font-bold text-foreground">Project Not Found</h2>
        <p className="text-muted-foreground">The project record you are looking for does not exist.</p>
        <Link to="/projects">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Projects
          </Button>
        </Link>
      </div>
    );
  }

  const handleToggleMilestone = (msId: string) => {
    const updatedMilestones = (project.milestones ?? []).map((m) => {
      if (m.id === msId) {
        const nextStatus = m.status === "completed" ? "pending" : "completed";
        return {
          ...m,
          status: nextStatus as Milestone["status"],
          completedDate: nextStatus === "completed" ? new Date().toISOString().slice(0, 10) : undefined,
        };
      }
      return m;
    });

    const nextProject = { ...project, milestones: updatedMilestones };
    persist({
      ...ops,
      projects: ops.projects.map((p) => (p.id === project.id ? nextProject : p)),
    });
  };

  const handleAddMilestone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!msName.trim()) return;

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

    const nextProject = { ...project, milestones: [...(project.milestones ?? []), newMs] };
    persist({
      ...ops,
      projects: ops.projects.map((p) => (p.id === project.id ? nextProject : p)),
    });

    // Reset sub-form
    setMsName("");
    setMsDesc("");
    setMsDueDate("");
    setMsUser("");
    setMsTrigger(false);
    setMsStatus("pending");
  };

  const handleRemoveMilestone = (msId: string) => {
    if (!confirm("Are you sure you want to delete this milestone?")) return;
    const nextProject = {
      ...project,
      milestones: (project.milestones ?? []).filter((m) => m.id !== msId),
    };
    persist({
      ...ops,
      projects: ops.projects.map((p) => (p.id === project.id ? nextProject : p)),
    });
  };

  const memberName = (userId?: string) => {
    if (!userId) return "";
    return members.find((m) => m.id === userId)?.name ?? "";
  };

  return (
    <div className="space-y-8">
      {/* Header with back navigation */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <Link
            to="/projects"
            className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Projects
          </Link>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            {project.client}
          </h1>
          <p className="text-sm text-muted-foreground">
            {project.projectType || "General Work"} &middot; {project.startDate ? `Started ${project.startDate}` : "No start date"}
          </p>
        </div>
        <div className="flex gap-2">
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${projectStatusBadgeClass(project.status)}`}>
            {projectStatusLabel(project.status)}
          </span>
          {project.priority && (
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
              project.priority === "high"
                ? "bg-rose-500/20 text-rose-700 dark:text-rose-300"
                : project.priority === "medium"
                ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                : "bg-blue-500/20 text-blue-700 dark:text-blue-300"
            }`}>
              {project.priority} Priority
            </span>
          )}
        </div>
      </div>

      {/* Progress & Deadlines */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between text-sm font-semibold">
              <span className="text-muted-foreground">Completion Progress</span>
              <span className="text-primary tabular-nums">{calculations.completionPercentage}%</span>
            </div>
            <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${calculations.completionPercentage}%` }}
              />
            </div>
          </div>
          {project.deadline && (
            <div className="flex items-center gap-3 border-t border-border pt-4 sm:border-t-0 sm:pt-0 sm:pl-6 sm:border-l">
              <Calendar className="h-8 w-8 text-primary" />
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase">Project Deadline</p>
                <p className="text-base font-bold text-foreground">{project.deadline}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* KPI Widgets */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Budget */}
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase">Total Budget</span>
            <DollarSign className="h-5 w-5 text-primary" />
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
            {formatINRWhole(calculations.budget)}
          </p>
          <div className="mt-1 text-[11px] text-muted-foreground flex justify-between">
            <span>Collected: {formatINRWhole(calculations.received)}</span>
            <span className="text-amber-500 font-medium">Pending: {formatINRWhole(calculations.pending)}</span>
          </div>
        </div>

        {/* Internal Expenses */}
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase">Internal Expenses</span>
            <Trash2 className="h-5 w-5 text-rose-500" />
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums text-rose-600 dark:text-rose-400">
            {formatINRWhole(calculations.internalExpenses)}
          </p>
          <div className="mt-1 text-[11px] text-muted-foreground flex justify-between">
            <span>Estimated Cost: {formatINRWhole(calculations.estimatedCost)}</span>
          </div>
        </div>

        {/* Profit */}
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase">Calculated Profit</span>
            <TrendingUp className="h-5 w-5 text-emerald-500" />
          </div>
          <p className={`mt-2 text-2xl font-bold tabular-nums ${calculations.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600"}`}>
            {formatINRWhole(calculations.profit)}
          </p>
          <div className="mt-1 text-[11px] text-muted-foreground">
            <span>Budget &minus; Costs &minus; Expenses</span>
          </div>
        </div>

        {/* Profit Margin */}
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase">Profit Margin</span>
            <Percent className="h-5 w-5 text-blue-500" />
          </div>
          <p className={`mt-2 text-2xl font-bold tabular-nums ${calculations.profitMargin >= 0 ? "text-blue-600 dark:text-blue-400" : "text-rose-600"}`}>
            {calculations.profitMargin.toFixed(1)}%
          </p>
          <div className="mt-1 text-[11px] text-muted-foreground">
            <span>Overall profitability index</span>
          </div>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Milestones Section (2 Columns) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-bold text-foreground border-b border-border pb-2 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" /> Project Milestones
            </h2>

            {/* Milestones List */}
            <div className="mt-4 space-y-3">
              {(project.milestones ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground italic text-center py-6">
                  No milestones defined for this project. Configure them below.
                </p>
              ) : (
                (project.milestones ?? []).map((ms) => {
                  const isCompleted = ms.status === "completed";
                  return (
                    <div
                      key={ms.id}
                      className={`flex items-start justify-between rounded-lg border p-4 transition-all ${
                        isCompleted ? "border-emerald-500/20 bg-emerald-500/5" : "border-border bg-card"
                      }`}
                    >
                      <div className="flex gap-3">
                        <input
                          type="checkbox"
                          checked={isCompleted}
                          onChange={() => handleToggleMilestone(ms.id)}
                          className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-primary cursor-pointer"
                        />
                        <div>
                          <p className={`font-semibold text-sm ${isCompleted ? "text-muted-foreground line-through" : "text-foreground"}`}>
                            {ms.name}
                          </p>
                          {ms.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{ms.description}</p>
                          )}
                          <div className="flex flex-wrap items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                            {ms.dueDate && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" /> Due: {ms.dueDate}
                              </span>
                            )}
                            {ms.assignedUser && (
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" /> Assigned: {memberName(ms.assignedUser)}
                              </span>
                            )}
                            {ms.paymentTrigger && (
                              <span className="bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded font-bold uppercase">
                                Payment Trigger
                              </span>
                            )}
                            {ms.completedDate && (
                              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                Completed: {ms.completedDate}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveMilestone(ms.id)}
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Quick Add Milestone Form */}
            <form onSubmit={handleAddMilestone} className="mt-6 border-t border-dashed border-border pt-5 space-y-4">
              <h3 className="text-sm font-bold text-foreground">Add Milestone</h3>
              
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Milestone Name *" id="ms-name">
                  <Input
                    id="ms-name"
                    value={msName}
                    onChange={(e) => setMsName(e.target.value)}
                    placeholder="e.g. Client Feedback Loop"
                    required
                  />
                </Field>
                <Field label="Due Date" id="ms-due">
                  <Input
                    id="ms-due"
                    type="date"
                    value={msDueDate}
                    onChange={(e) => setMsDueDate(e.target.value)}
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Status" id="ms-status">
                  <Select value={msStatus} onValueChange={(v) => setMsStatus(v as Milestone["status"])}>
                    <SelectTrigger id="ms-status">
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

                <Field label="Assigned Partner" id="ms-user">
                  <Select value={msUser} onValueChange={(v) => setMsUser(v)}>
                    <SelectTrigger id="ms-user">
                      <SelectValue placeholder="Assign partner" />
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
                  <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={msTrigger}
                      onChange={(e) => setMsTrigger(e.target.checked)}
                      className="rounded border-input text-primary focus:ring-primary"
                    />
                    Billing Cycle Trigger?
                  </label>
                </div>
              </div>

              <Field label="Description" id="ms-desc">
                <Input
                  id="ms-desc"
                  value={msDesc}
                  onChange={(e) => setMsDesc(e.target.value)}
                  placeholder="Details regarding this milestone's expectations..."
                />
              </Field>

              <Button type="submit" size="sm" className="w-full inline-flex items-center justify-center gap-1">
                <PlusCircle className="h-4 w-4" /> Add Milestone
              </Button>
            </form>
          </div>
        </div>

        {/* Right: Project Financial Audit / Transactions List (1 Column) */}
        <div className="space-y-6">
          {/* Linked transactions */}
          <div className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-bold text-foreground border-b border-border pb-2 flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" /> Financial History
            </h2>

            <div className="mt-4 space-y-3 max-h-[450px] overflow-y-auto pr-1">
              {calculations.projectTxs.length === 0 ? (
                <p className="text-xs text-muted-foreground italic text-center py-6">
                  No invoices or expenses logged for this project yet.
                </p>
              ) : (
                calculations.projectTxs.map((tx) => (
                  <div key={tx.id} className="flex justify-between items-start text-xs border border-border rounded p-3 bg-muted/20">
                    <div>
                      <p className="font-semibold text-foreground">{tx.description}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{tx.date} &middot; {tx.paymentMethod.toUpperCase()}</p>
                    </div>
                    <span className={`font-bold tabular-nums ${
                      tx.type === "client_payment" ? "text-emerald-600" : "text-rose-600"
                    }`}>
                      {tx.type === "client_payment" ? "+" : "-"}{formatINRWhole(tx.amount)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
          
          {/* Notes */}
          {project.notes && (
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6">
              <h2 className="text-sm font-bold text-foreground border-b border-border pb-2">
                Project Notes
              </h2>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground whitespace-pre-line">
                {project.notes}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
