import { useCallback, useEffect, useState } from "react";
import type { LeadListEntry } from "@/lib/types";
import { logClientError } from "@/lib/client-logger";
import {
  getLeadListFn,
  importLeadListFn,
  patchLeadListContactedFn,
} from "@/server/lead-list-fns";

export function useLeadList() {
  const [entries, setEntries] = useState<LeadListEntry[]>([]);
  const [version, setVersion] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await getLeadListFn();
      setEntries(payload.entries);
      setVersion(payload.version);
    } catch (err) {
      logClientError("leadList.load", err);
      setError(err instanceof Error ? err.message : "Could not load lead list.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setContacted = useCallback(
    async (id: string, contacted: boolean) => {
      // Optimistic UI
      setEntries((current) =>
        current.map((entry) => (entry.id === id ? { ...entry, contacted } : entry)),
      );
      try {
        const result = await patchLeadListContactedFn({
          data: { id, contacted, expectedVersion: version },
        });
        setEntries(result.entries);
        setVersion(result.version);
        if (result.conflict) {
          throw new Error("Lead list was updated elsewhere — refreshed. Try again.");
        }
      } catch (err) {
        logClientError("leadList.setContacted", err);
        await reload();
        throw err;
      }
    },
    [reload, version],
  );

  const importEntries = useCallback(
    async (incoming: LeadListEntry[]) => {
      const result = await importLeadListFn({
        data: { entries: incoming, expectedVersion: version },
      });
      setEntries(result.entries);
      setVersion(result.version);
      if (result.conflict) {
        throw new Error("Lead list changed on the server. Refresh and try the upload again.");
      }
      return result;
    },
    [version],
  );

  return { entries, loading, error, reload, setContacted, importEntries };
}
