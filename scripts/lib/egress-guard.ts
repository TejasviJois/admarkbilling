/**
 * Refuse heavy Supabase scripts unless explicitly acknowledged.
 * Mirror of scripts/lib/egress-guard.mjs for TypeScript runners (tsx).
 */
export function requireEgressAck(scriptLabel = "this script"): void {
  const envOk = ["1", "true", "yes", "on"].includes(
    String(process.env.ALLOW_HEAVY_SUPABASE_SCRIPTS ?? "")
      .trim()
      .toLowerCase(),
  );
  const flagOk = process.argv.includes("--allow-egress");
  if (envOk || flagOk) return;
  console.error(`
REFUSED: ${scriptLabel} can pull large payloads from Supabase (egress).

Re-run only when intentional:
  ALLOW_HEAVY_SUPABASE_SCRIPTS=1 npx tsx ${process.argv[1] ?? "scripts/..."} ...
  # or
  npx tsx ${process.argv[1] ?? "scripts/..."} --allow-egress ...

Normal app traffic must use RELATIONAL_READS (default on) — never re-enable JSON blobs.
`);
  process.exit(1);
}
