/** Free-plan caps from the Supabase usage dashboard. */
export const FREE_PLAN_CAPS = {
  databaseBytes: 0.5 * 1024 ** 3,
  storageBytes: 1 * 1024 ** 3,
} as const;

export type CloudUsageSnapshot = {
  configured: boolean;
  databaseBytes: number | null;
  storageBytes: number | null;
  storageFileCount: number | null;
  dashboardUrl: string | null;
  measuredAt: string | null;
  error: string | null;
};

export function usagePercent(used: number, cap: number): number {
  if (cap <= 0) return 0;
  return Math.min(100, (used / cap) * 100);
}

export function formatGbPair(usedBytes: number, capBytes: number): string {
  const usedGb = usedBytes / 1024 ** 3;
  const capGb = capBytes / 1024 ** 3;
  const usedText = usedGb.toFixed(3);
  const capText = capGb >= 1 ? String(capGb) : capGb.toFixed(1);
  const pct = usagePercent(usedBytes, capBytes);
  const pctText = pct > 0 && pct < 1 ? "<1%" : `${Math.round(pct)}%`;
  return `${usedText} / ${capText} GB (${pctText})`;
}
