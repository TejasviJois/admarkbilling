import { useState, useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Calendar,
  DollarSign,
  CheckCircle2,
  Clock,
  User,
  PlusCircle,
  Trash2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Field,
  OperationsLoading,
  OperationsPageHeader,
} from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";
import { useCompany } from "@/hooks/use-company";
import { formatINRWhole } from "@/lib/invoice-calc";
import { projectContractValue } from "@/lib/project-billing";
import { projectStatusBadgeClass, projectStatusLabel } from "@/lib/project-status";
import type { Project, Milestone } from "@/lib/types";

export const Route = createFileRoute("/projects/$id")({ component: ProjectDetailsPage });

function ProjectDetailsPage() {
  const { id } = Route.useParams();
  const { ops, persist, loading } = useOperations();
  const { company } = useCompany();
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

  const members = (company.companyMembers ?? []).filter((member) => member.status !== "inactive");

  // Operational project progress only. Financial movement belongs in Accounts.
  const calculations = useMemo(() => {
    if (!project) return null;

    const budget = projectContractValue(project) || project.budget || 0;

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
      completionPercentage,
    };
  }, [project]);

  if (loading) return <OperationsLoading />;
  if (!project || !calculations) {
    return (
      <div className="space-y-4 p-8 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
        <h2 className="text-xl font-bold text-foreground">Project Not Found</h2>
        <p className="text-muted-foreground">
          The project record you are looking for does not exist.
        </p>
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
          completedDate:
            nextStatus === "completed" ? new Date().toISOString().slice(0, 10) : undefined,
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
        <div className="space-y-1.5">
          <Link
            to="/projects"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/60 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Projects
          </Link>
          <h1 className="text-3xl font-black tracking-tight text-white md:text-4xl">
            {project.client}
          </h1>
          <p className="text-xs text-white/50">
            {project.projectType || "General Work"} &middot;{" "}
            {project.startDate ? `Started ${project.startDate}` : "No start date"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${projectStatusBadgeClass(project.status)}`}
          >
            {projectStatusLabel(project.status)}
          </span>
          {project.priority && (
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                project.priority === "high"
                  ? "border-rose-500/20 bg-rose-500/10 text-rose-400"
                  : project.priority === "medium"
                    ? "border-amber-500/20 bg-amber-500/10 text-amber-400"
                    : "border-sky-500/20 bg-sky-500/10 text-sky-400"
              }`}
            >
              {project.priority} Priority
            </span>
          )}
        </div>
      </div>

      {/* Progress & Deadlines */}
      <div className="rounded-2xl border border-white/10 glass-panel p-6 shadow-xl">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-white/60">
              <span>Completion Progress</span>
              <span className="text-[#ff6b2b] font-mono text-sm tabular-nums">
                {calculations.completionPercentage}%
              </span>
            </div>
            <div className="h-3 w-full rounded-full bg-white/5 border border-white/10 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#ff6b2b] to-[#f04400] rounded-full transition-all duration-500 shadow-[0_0_12px_rgba(255,107,43,0.5)]"
                style={{ width: `${calculations.completionPercentage}%` }}
              />
            </div>
          </div>
          {project.deadline && (
            <div className="flex items-center gap-3.5 border-t border-white/10 pt-4 sm:border-t-0 sm:pt-0 sm:pl-6 sm:border-l">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-[#ff6b2b]">
                <Calendar className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[11px] font-bold text-white/40 uppercase tracking-wider">
                  Project Deadline
                </p>
                <p className="text-base font-bold text-white">{project.deadline}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Revenue context only — payment movement is managed in Accounts. */}
      <div className="max-w-xs rounded-2xl border border-white/10 glass-panel p-5 shadow-lg">
        <div className="flex items-center justify-between text-white/60">
          <span className="text-xs font-bold uppercase tracking-wider text-white/50">Contract revenue</span>
          <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
            <DollarSign className="h-4 w-4" />
          </span>
        </div>
        <p className="mt-3 text-2xl font-black tabular-nums text-white">
          {formatINRWhole(calculations.budget)}
        </p>
      </div>

      {/* Main Content Layout */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Milestones Section (2 Columns) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-white/10 glass-panel p-6 shadow-xl">
            <h2 className="text-base font-bold text-white border-b border-white/10 pb-3 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-[#ff6b2b]" /> Project Milestones
            </h2>

            {/* Milestones List */}
            <div className="mt-5 space-y-3">
              {(project.milestones ?? []).length === 0 ? (
                <p className="text-sm text-white/40 italic text-center py-8">
                  No milestones defined for this project. Configure them below.
                </p>
              ) : (
                (project.milestones ?? []).map((ms) => {
                  const isCompleted = ms.status === "completed";
                  return (
                    <div
                      key={ms.id}
                      className={`flex items-start justify-between rounded-xl border p-4 transition-all ${
                        isCompleted
                          ? "border-emerald-500/20 bg-emerald-500/[0.04]"
                          : "border-white/10 glass-card"
                      }`}
                    >
                      <div className="flex gap-3.5">
                        <input
                          type="checkbox"
                          checked={isCompleted}
                          onChange={() => handleToggleMilestone(ms.id)}
                          className="mt-1 h-4 w-4 rounded border-white/20 bg-white/5 text-[#ff6b2b] focus:ring-[#ff6b2b] cursor-pointer"
                        />
                        <div>
                          <p
                            className={`font-semibold text-sm ${isCompleted ? "text-white/40 line-through" : "text-white"}`}
                          >
                            {ms.name}
                          </p>
                          {ms.description && (
                            <p className="text-xs text-white/50 mt-0.5">{ms.description}</p>
                          )}
                          <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-white/50">
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
                              <span className="border border-amber-500/20 bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded font-bold uppercase text-[10px]">
                                Payment Trigger
                              </span>
                            )}
                            {ms.completedDate && (
                              <span className="text-emerald-400 font-semibold">
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
                        className="text-white/40 hover:text-rose-400 hover:bg-rose-500/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Quick Add Milestone Form */}
            <form
              onSubmit={handleAddMilestone}
              className="mt-8 border-t border-white/10 pt-6 space-y-4"
            >
              <h3 className="text-sm font-bold text-white">Add Milestone</h3>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Milestone Name *" id="ms-name">
                  <Input
                    id="ms-name"
                    value={msName}
                    onChange={(e) => setMsName(e.target.value)}
                    placeholder="e.g. Client Feedback Loop"
                    className="border-white/10 bg-white/5 text-white"
                    required
                  />
                </Field>
                <Field label="Due Date" id="ms-due">
                  <Input
                    id="ms-due"
                    type="date"
                    value={msDueDate}
                    onChange={(e) => setMsDueDate(e.target.value)}
                    className="border-white/10 bg-white/5 text-white"
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Status" id="ms-status">
                  <Select
                    value={msStatus}
                    onValueChange={(v) => setMsStatus(v as Milestone["status"])}
                  >
                    <SelectTrigger id="ms-status" className="border-white/10 bg-white/5 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-white/10 bg-[#16161c] text-white">
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="delayed">Delayed</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Assigned Team Member" id="ms-user">
                  <Select value={msUser} onValueChange={(v) => setMsUser(v)}>
                    <SelectTrigger id="ms-user" className="border-white/10 bg-white/5 text-white">
                      <SelectValue placeholder="Assign team member" />
                    </SelectTrigger>
                    <SelectContent className="border-white/10 bg-[#16161c] text-white">
                      {members.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <div className="flex items-center h-full pt-6">
                  <label className="flex items-center gap-2 text-xs font-semibold text-white/60 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={msTrigger}
                      onChange={(e) => setMsTrigger(e.target.checked)}
                      className="rounded border-white/20 bg-white/5 text-[#ff6b2b] focus:ring-[#ff6b2b]"
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
                  className="border-white/10 bg-white/5 text-white"
                />
              </Field>

              <Button
                type="submit"
                size="sm"
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#ff6b2b] to-[#f04400] text-white font-bold hover:shadow-[0_0_20px_rgba(255,107,43,0.3)] transition-all"
              >
                <PlusCircle className="h-4 w-4" /> Add Milestone
              </Button>
            </form>
          </div>
        </div>

        {/* Right: Operational notes */}
        <div className="space-y-6">
          {/* Notes */}
          {project.notes && (
            <div className="rounded-2xl border border-white/10 glass-panel p-5 shadow-lg">
              <h2 className="text-sm font-bold text-white border-b border-white/10 pb-3">
                Project Notes
              </h2>
              <p className="mt-3 text-xs leading-relaxed text-white/70 whitespace-pre-line">
                {project.notes}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
