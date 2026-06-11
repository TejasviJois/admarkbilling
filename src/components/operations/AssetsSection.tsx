import { useMemo, useState } from "react";
import { Plus, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AssetFormDialog } from "@/components/operations/AssetFormDialog";
import { SearchWithPeriodFilter } from "@/components/operations/SearchWithPeriodFilter";
import { assetCategoryLabel, formatAssetValue, sumAssets } from "@/lib/assets";
import { isWithinPeriod, DEFAULT_PERIOD, type PeriodKey } from "@/lib/date-range-filter";
import type { AssetEntry, OperationsData } from "@/lib/types";
import { DataSection, DataTable, EmptyRow, RowDelete, RowEdit } from "./operations-ui";

export function AssetsSection({
  ops,
  persist,
  open,
  onOpenChange,
}: {
  ops: OperationsData;
  persist: (next: OperationsData) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<PeriodKey>(DEFAULT_PERIOD);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AssetEntry | null>(null);

  const assets = useMemo(
    () =>
      [...(ops.assets ?? [])].sort((a, b) => b.acquiredDate.localeCompare(a.acquiredDate)),
    [ops.assets],
  );
  const total = sumAssets(assets);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter((asset) => {
      if (!isWithinPeriod(asset.acquiredDate, period)) return false;
      if (!q) return true;
      const haystack = [
        asset.name,
        assetCategoryLabel(asset.category),
        asset.acquiredDate,
        asset.notes,
        String(asset.value),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [assets, search, period]);

  const saveAsset = (asset: AssetEntry) => {
    const existing = ops.assets ?? [];
    const next = existing.some((a) => a.id === asset.id)
      ? existing.map((a) => (a.id === asset.id ? asset : a))
      : [asset, ...existing];
    persist({ ...ops, assets: next });
  };

  const removeAsset = (id: string) => {
    persist({ ...ops, assets: (ops.assets ?? []).filter((a) => a.id !== id) });
  };

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (asset: AssetEntry) => {
    setEditing(asset);
    setFormOpen(true);
  };

  return (
    <>
      <DataSection
        id="assets"
        collapsible
        defaultOpen={false}
        open={open}
        onOpenChange={onOpenChange}
        title="Assets"
        description="Equipment, cash, investments, and other company holdings."
        icon={<Shield className="h-5 w-5 text-sky-400" strokeWidth={2} />}
        action={
          <Button type="button" size="icon" onClick={openAdd} aria-label="Add asset">
            <Plus className="h-4 w-4" />
          </Button>
        }
      >
        <p className="mb-4 text-sm text-muted-foreground">
          Total asset value:{" "}
          <span className="font-semibold tabular-nums text-sky-300">{formatAssetValue(total)}</span>
        </p>

        <div className="mb-6 max-w-xl">
          <SearchWithPeriodFilter
            id="asset-search"
            search={search}
            onSearchChange={setSearch}
            period={period}
            onPeriodChange={setPeriod}
            placeholder="Name, category, date…"
          />
        </div>

        {assets.length === 0 ? (
          <EmptyRow message="No assets logged yet. Tap + to add one." />
        ) : filtered.length === 0 ? (
          <EmptyRow message="No assets match your search." />
        ) : (
          <DataTable
            headers={["Name", "Category", "Value", "Acquired", "Notes", ""]}
            rows={filtered.map((asset) => [
              asset.name,
              assetCategoryLabel(asset.category),
              <span key={`val-${asset.id}`} className="font-medium tabular-nums text-sky-300">
                {formatAssetValue(asset.value)}
              </span>,
              asset.acquiredDate,
              asset.notes || "—",
              <div key={`actions-${asset.id}`} className="flex justify-end gap-1">
                <RowEdit onClick={() => openEdit(asset)} />
                <RowDelete onClick={() => removeAsset(asset.id)} />
              </div>,
            ])}
          />
        )}
      </DataSection>

      <AssetFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        asset={editing}
        onSave={saveAsset}
      />
    </>
  );
}
