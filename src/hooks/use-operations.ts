import { useEffect, useState } from "react";
import { logClientError } from "@/lib/client-logger";
import { loadOperations, saveOperations } from "@/lib/operations-storage";
import type { OperationsData } from "@/lib/types";

const EMPTY: OperationsData = { projects: [], partnerships: [], expenses: [] };

export function useOperations() {
  const [ops, setOps] = useState<OperationsData>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadOperations()
      .then(setOps)
      .catch((e) => logClientError("useOperations.load", e))
      .finally(() => setLoading(false));
  }, []);

  const persist = (next: OperationsData) => {
    setOps(next);
    void saveOperations(next).catch((e) => logClientError("useOperations.save", e));
  };

  return { ops, persist, loading };
}
