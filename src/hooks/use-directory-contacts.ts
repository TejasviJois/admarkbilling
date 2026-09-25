import { useCallback, useEffect, useState } from "react";
import type { Contact } from "@/lib/types";
import { logClientError } from "@/lib/client-logger";
import { getDirectoryContactsFn, patchDirectoryContactedFn } from "@/server/directory-fns";

export function useDirectoryContacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [version, setVersion] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await getDirectoryContactsFn();
      setContacts(payload.contacts);
      setVersion(payload.version);
    } catch (err) {
      logClientError("directoryContacts.load", err);
      setError(err instanceof Error ? err.message : "Could not load directory.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setContacted = useCallback(
    async (id: string, contacted: boolean) => {
      setContacts((current) =>
        current.map((contact) => (contact.id === id ? { ...contact, contacted } : contact)),
      );
      try {
        const result = await patchDirectoryContactedFn({
          data: { id, contacted, expectedVersion: version },
        });
        setContacts(result.contacts);
        setVersion(result.version);
        if (result.conflict) {
          throw new Error("Directory was updated elsewhere — refreshed.");
        }
      } catch (err) {
        logClientError("directoryContacts.contacted", err);
        await reload();
        throw err;
      }
    },
    [reload, version],
  );

  return { contacts, loading, error, reload, setContacted };
}
