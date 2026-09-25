import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerConfig } from "./env";
import { requireServerSupabase } from "./supabase-admin";
import { requireAdmin } from "./app-session.server";
import { ADMARK_FILES_BUCKET, ensureStorageBucket } from "./file-storage";

export const getBackendHealthFn = createServerFn({ method: "GET" }).handler(async () => {
  const configured = Boolean(getSupabaseServerConfig());
  if (!configured) {
    return {
      configured: false,
      ready: false,
      checks: {
        env: false,
        session: false,
        invoicesTable: false,
        companyTable: false,
        operationsTable: false,
        storageBucket: false,
      },
    } as const;
  }

  let session = false;
  try {
    await requireAdmin();
    session = true;
  } catch {
    return {
      configured: true,
      ready: false,
      checks: {
        env: true,
        session: false,
        invoicesTable: false,
        companyTable: false,
        operationsTable: false,
        storageBucket: false,
      },
    } as const;
  }

  const sb = requireServerSupabase();
  const [invoices, company, operations, storageBucket] = await Promise.all([
    sb.from("invoices").select("id").limit(1),
    sb.from("company_settings").select("id").limit(1),
    sb.from("operations_data").select("id").limit(1),
    ensureStorageBucket(sb),
  ]);

  const checks = {
    env: true,
    session: true,
    invoicesTable: !invoices.error,
    companyTable: !company.error,
    operationsTable: !operations.error,
    storageBucket,
  };

  return {
    configured: true,
    ready: Object.values(checks).every(Boolean),
    bucket: ADMARK_FILES_BUCKET,
    checks,
    errors: [
      invoices.error?.message,
      company.error?.message,
      operations.error?.message,
      !storageBucket
        ? `Storage bucket "${ADMARK_FILES_BUCKET}" not found — run supabase/admark_billing.sql`
        : null,
    ].filter(Boolean) as string[],
  } as const;
});
