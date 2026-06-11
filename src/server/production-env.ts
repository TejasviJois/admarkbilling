/** One-time production env check — logs actionable errors without leaking secrets. */
let checked = false;

export function warnMissingProductionEnv(): void {
  if (checked || process.env.NODE_ENV !== "production") return;
  checked = true;

  const missing: string[] = [];
  if (!process.env.SUPABASE_URL?.trim()) missing.push("SUPABASE_URL");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!process.env.APP_SESSION_SECRET?.trim()) missing.push("APP_SESSION_SECRET");
  if (!process.env.ADMARK_APP_PASSWORD?.trim()) missing.push("ADMARK_APP_PASSWORD");

  if (missing.length === 0) return;

  console.error(
    `[Admark Billing] Missing required production environment variables: ${missing.join(", ")}. ` +
      "Add them in Vercel → Project → Settings → Environment Variables (Production + Preview).",
  );
}
