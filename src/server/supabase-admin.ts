import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { getSupabaseServerConfig } from "./env";

export function requireServerSupabase() {
  const cfg = getSupabaseServerConfig();
  if (!cfg) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the server environment (e.g. Vercel project env or a local .env file).",
    );
  }
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  return createClient(cfg.url, cfg.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(nodeMajor < 22 ? { realtime: { transport: ws as unknown as typeof WebSocket } } : {}),
  });
}
