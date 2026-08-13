import { getDataBackendStatus } from "@/server/invoice-fns";

/**
 * Shared client-side backend configured flag.
 * Parallel loaders (ops / invoices / docs / company) used to each call
 * getDataBackendStatus before the per-module cache filled — one shared
 * in-flight promise collapses that to a single round-trip.
 */
let configured: boolean | null = null;
let inflight: Promise<boolean> | null = null;

export async function isServerApiConfigured(): Promise<boolean> {
  if (configured !== null) return configured;
  if (inflight) return inflight;

  inflight = getDataBackendStatus()
    .then((status) => {
      configured = status.configured;
      return configured;
    })
    .catch(() => {
      configured = false;
      return false;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

/** Seed / reset the cache (e.g. after Settings checks the banner). */
export function setServerApiConfigured(value: boolean | null): void {
  configured = value;
}

export function getServerApiConfiguredCached(): boolean | null {
  return configured;
}
