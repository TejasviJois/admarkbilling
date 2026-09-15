import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
import { formatINRWhole } from "@/lib/invoice-calc";
import { computeBookedRevenue } from "@/lib/project-billing";
import { toLocalISODate } from "@/lib/date-range-filter";
import type { Project, ProjectCommission, ProjectCommissionSplit } from "@/lib/types";

function emptySplit(): ProjectCommissionSplit {
  return {
    id: `split-${crypto.randomUUID().slice(0, 8)}`,
    personName: "",
    amount: 0,
  };
}

export function CommissionFormDialog({
  open,
  onOpenChange,
  commission,
  projects,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commission: ProjectCommission | null;
  projects: Project[];
  onSave: (saved: ProjectCommission) => void;
}) {
  const [projectId, setProjectId] = useState("");
  const [label, setLabel] = useState("");
  const [splits, setSplits] = useState<ProjectCommissionSplit[]>([emptySplit()]);
  const [status, setStatus] = useState<ProjectCommission["status"]>("planned");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const projectOptions = useMemo(
    () =>
      [...projects].sort((a, b) =>
        (a.name || a.client).localeCompare(b.name || b.client, undefined, { sensitivity: "base" }),
      ),
    [projects],
  );

  const selectedProject = projectOptions.find((p) => p.id === projectId);
  const contractHint = selectedProject
    ? computeBookedRevenue(selectedProject, toLocalISODate())
    : 0;
  const splitTotal = splits.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

  useEffect(() => {
    if (!open) return;
    setProjectId(commission?.projectId ?? projectOptions[0]?.id ?? "");
    setLabel(commission?.label ?? "");
    setSplits(commission?.splits?.length ? commission.splits.map((s) => ({ ...s })) : [emptySplit()]);
    setStatus(commission?.status ?? "planned");
    setNotes(commission?.notes ?? "");
    setError("");
  }, [open, commission, projectOptions]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) {
      setError("Pick a project.");
      return;
    }
    const cleaned = splits
      .map((s) => ({
        ...s,
        personName: s.personName.trim(),
        amount: Number(s.amount) || 0,
      }))
      .filter((s) => s.personName && s.amount > 0);
    if (cleaned.length === 0) {
      setError("Add at least one person with an amount.");
      return;
    }
    const now = Date.now();
    onSave({
      id: commission?.id ?? `comm-${crypto.randomUUID().slice(0, 8)}`,
      projectId,
      label: label.trim() || undefined,
      splits: cleaned,
      status,
      paidAt: status === "paid" ? commission?.paidAt || toLocalISODate() : undefined,
      notes: notes.trim() || undefined,
      createdAt: commission?.createdAt ?? now,
      updatedAt: now,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{commission ? "Edit commission" : "Add project commission"}</DialogTitle>
          <DialogDescription>
            Fixed ₹ splits for people on a project. Does not change project outstanding.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <Field label="Project *" id="ops-comm-project">
            <Select value={projectId || undefined} onValueChange={setProjectId}>
              <SelectTrigger id="ops-comm-project">
                <SelectValue placeholder="Choose project…" />
              </SelectTrigger>
              <SelectContent>
                {projectOptions.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name || project.client}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {selectedProject ? (
            <p className="text-xs text-muted-foreground">
              Project booked value {formatINRWhole(contractHint)} · splits total{" "}
              {formatINRWhole(splitTotal)}
            </p>
          ) : null}
          <Field label="Label" id="ops-comm-label">
            <Input
              id="ops-comm-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Referral split"
            />
          </Field>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">People</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setSplits((prev) => [...prev, emptySplit()])}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add
              </Button>
            </div>
            {splits.map((split, index) => (
              <div key={split.id} className="grid grid-cols-[1fr_7rem_auto] gap-2">
                <Input
                  value={split.personName}
                  onChange={(e) =>
                    setSplits((prev) =>
                      prev.map((s, i) =>
                        i === index ? { ...s, personName: e.target.value } : s,
                      ),
                    )
                  }
                  placeholder="Person name"
                />
                <Input
                  type="number"
                  min={0}
                  value={split.amount || ""}
                  onChange={(e) =>
                    setSplits((prev) =>
                      prev.map((s, i) =>
                        i === index ? { ...s, amount: Number(e.target.value) || 0 } : s,
                      ),
                    )
                  }
                  placeholder="₹"
                />
                <button
                  type="button"
                  className="rounded-md p-2 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-400"
                  onClick={() =>
                    setSplits((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
                  }
                  aria-label="Remove person"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <Field label="Status" id="ops-comm-status">
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as ProjectCommission["status"])}
            >
              <SelectTrigger id="ops-comm-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="planned">Planned</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Notes" id="ops-comm-notes">
            <Input id="ops-comm-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          {error ? <p className="text-sm text-rose-400">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
