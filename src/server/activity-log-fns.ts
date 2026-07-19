import { createServerFn } from "@tanstack/react-start";
import { assertAppSession } from "./app-session";
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
    await assertAppSession();
    return readActivityLogsCore();
  },
);

export const saveActivityLogsFn = createServerFn({ method: "POST" })
  .inputValidator((data: SaveActivityLogsInput) => data)
  .handler(async ({ data }): Promise<SaveActivityLogsResult> => {
    await assertAppSession();
    return saveActivityLogsCore(data);
  });
