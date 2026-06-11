import { formatINRWhole } from "./invoice-calc";
import type { AssetCategory, AssetEntry } from "./types";

export const ASSET_CATEGORY_LABELS: Record<AssetCategory, string> = {
  equipment: "Equipment",
  digital: "Digital / software",
  cash: "Cash & bank",
  investment: "Investment",
  other: "Other",
};

export function assetCategoryLabel(category: AssetCategory | string | undefined): string {
  if (!category) return "Other";
  return ASSET_CATEGORY_LABELS[category as AssetCategory] ?? String(category);
}

export function sumAssets(assets: AssetEntry[] | undefined): number {
  return (assets ?? []).reduce((total, asset) => total + (asset.value || 0), 0);
}

export function formatAssetValue(value: number): string {
  return formatINRWhole(value);
}
