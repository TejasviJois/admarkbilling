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
import { ASSET_CATEGORY_LABELS } from "@/lib/assets";
import type { AssetCategory, AssetEntry } from "@/lib/types";

const CATEGORIES = Object.keys(ASSET_CATEGORY_LABELS) as AssetCategory[];

const EMPTY = {
  name: "",
  value: "",
  acquiredDate: new Date().toISOString().slice(0, 10),
  category: "equipment" as AssetCategory,
  notes: "",
};

export function AssetFormDialog({
  open,
  onOpenChange,
  asset,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset?: AssetEntry | null;
  onSave: (asset: AssetEntry) => void;
}) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(asset);

  useEffect(() => {
    if (!open) return;
    if (asset) {
      setForm({
        name: asset.name,
        value: String(asset.value),
        acquiredDate: asset.acquiredDate,
        category: asset.category,
        notes: asset.notes ?? "",
      });
    } else {
      setForm({ ...EMPTY, acquiredDate: new Date().toISOString().slice(0, 10) });
    }
    setError(null);
  }, [open, asset]);

  const submit = () => {
    if (!form.name.trim() || !form.value || !form.acquiredDate) {
      setError("Name, value, and date are required.");
      return;
    }
    const value = Number(form.value);
    if (!Number.isFinite(value) || value < 0) {
      setError("Enter a valid value.");
      return;
    }

    onSave({
      id: asset?.id ?? crypto.randomUUID(),
      name: form.name.trim(),
      value,
      acquiredDate: form.acquiredDate,
      category: form.category,
      notes: form.notes.trim() || undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit asset" : "Add asset"}</DialogTitle>
          <DialogDescription>
            Track equipment, cash, investments, and other company assets.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Name" id="asset-name">
            <Input
              id="asset-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="MacBook Pro, office furniture…"
            />
          </Field>
          <Field label="Category" id="asset-category">
            <Select
              value={form.category}
              onValueChange={(v) => setForm((f) => ({ ...f, category: v as AssetCategory }))}
            >
              <SelectTrigger id="asset-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {ASSET_CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Value (₹)" id="asset-value">
              <Input
                id="asset-value"
                type="number"
                min={0}
                value={form.value}
                onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
              />
            </Field>
            <Field label="Acquired on" id="asset-date">
              <Input
                id="asset-date"
                type="date"
                value={form.acquiredDate}
                onChange={(e) => setForm((f) => ({ ...f, acquiredDate: e.target.value }))}
              />
            </Field>
          </div>
          <Field label="Notes" id="asset-notes">
            <Input
              id="asset-notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Optional"
            />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={submit}>
            {isEdit ? "Save changes" : "Add asset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
