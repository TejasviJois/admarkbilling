import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "./app-session.server";
import {
  readActivityLogsCore,
  saveActivityLogsCore,
  type SaveActivityLogsInput,
  type SaveActivityLogsResult,
  type VersionedActivityLogs,
} from "./activity-log-core";

export type { SaveActivityLogsInput, SaveActivityLogsResult, VersionedActivityLogs };

export const getActivityLogsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<VersionedActivityLogs> => {
    await requireAdmin();
    return readActivityLogsCore();
  },
);

export const saveActivityLogsFn = createServerFn({ method: "POST" })
  .inputValidator((data: SaveActivityLogsInput) => data)
  .handler(async ({ data }): Promise<SaveActivityLogsResult> => {
    await requireAdmin();
    return saveActivityLogsCore(data);
  });
