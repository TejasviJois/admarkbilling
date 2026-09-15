# Audit fixes — 15 Sep 2026

Document of changes applied after the full-software security / performance / dead-code audit.

## Action required from you

1. **Set strong secrets in `.env` / Vercel**
   - `ADMARK_APP_PASSWORD` — required everywhere now (no hardcoded `HTRP@2026`).
   - `APP_SESSION_SECRET` — min 16 chars; mandatory in production.
   - **Rotate** `SUPABASE_SERVICE_ROLE_KEY` if this machine/chat may have exposed it.
2. **Apply migration** `supabase/migrations/20260915150000_private_admark_files_bucket.sql` so `admark-files` is private.
3. **Re-login** after deploy — session cookies are no longer a static shared token.
4. Existing file URLs may need a page reload / re-upload after the bucket is private (new uploads use signed URLs).

---

## Security

| Change | Files |
|--------|--------|
| Removed hardcoded default portal password; refuse known insecure passwords in production | `src/server/app-auth-credentials.ts`, `src/start.ts` |
| Production boot **fails** if password missing or is a known default (was warn-only) | `src/start.ts` |
| Per-login session tokens with random `jti` + expiry (HMAC-signed), not a static shared cookie | `src/server/app-session.ts` |
| Timing-safe password compare | `src/server/app-auth-credentials.ts` |
| Stricter login rate limit (10 / 15 min) + existing IP limit | `src/server/app-session.ts`, `src/server/auth-fns.ts` |
| Encrypt refuses plaintext fallback on failure | `shared/encryption-core.mjs` |
| Uploads prefer **signed URLs**; helpers to extract path / refresh access | `src/server/file-storage.ts` |
| Migration to set `admark-files` **private** | `supabase/migrations/20260915150000_private_admark_files_bucket.sql` |
| Unauthenticated cloud-usage no longer returns dashboard URL | `src/server/cloud-usage-fns.ts` |
| `.env.example` clarifies required password / secret | `.env.example` |

## Performance / delays

| Change | Files |
|--------|--------|
| Ops GET uses 60s LRU `cacheThrough` | `src/server/operations-fns.ts` |
| Docs GET uses 60s LRU `cacheThrough` | `src/server/documents-fns.ts` |
| Save paths update cache instead of only deleting + full reload where possible | same |
| Removed artificial **1.2s** 404 redirect delay | `src/routes/__root.tsx` |

## Correctness (Office & Ops / EMI)

| Change | Files |
|--------|--------|
| Month KPI unpaid/due uses `nextPaymentAmount` (final differential) | `src/lib/ops-costs.ts` |
| Log payment to Accounts uses differential amount when applicable | `src/lib/ops-costs.ts` |

## Dead / unwanted code cleanup

| Change | Files |
|--------|--------|
| Deleted orphan `relink-payment-proofs.ts` | removed |
| Fixed local→cloud ops key (`admark.operations.v2`) | `src/lib/sync-to-cloud.ts` |
| Removed unused `ANALYTICS_PERIOD_OPTIONS` | `src/lib/date-range-filter.ts` |
| Removed unused `usesRemoteDatabase` | `src/lib/storage.ts` |
| Removed unused `sumActivePipelineBooked` | `src/lib/project-billing.ts` |
| Marked dual-write flag deprecated in comment | `src/server/env.ts` |

## Script egress guards

Added `requireEgressAck` to previously unguarded scripts:

- `backfill-invoice-project-payments.mjs`
- `check-all-sql-deployed.mjs`
- `check-duplicate-invoice-numbers.mjs`
- `check-relational-bank-details.mjs`
- `check-relational-company.mjs`
- `check-safe-mutation-rpcs.mjs`
- `dedupe-invoice-recv-mirrors.mjs`
- `export-active-client-projects.mjs`
- `smoke-relational.mjs` / `smoke-relational-write.mjs`
- `tx-month-breakdown.mjs`
- `verify-blx-outstanding.mjs`
- `verify-unique-invoice-numbers.mjs`

Run with `ALLOW_HEAVY_SUPABASE_SCRIPTS=1` or `--allow-egress`.

---

## Intentionally not fully rewritten (follow-ups)

- Narrowing every `select("*")` in relational reads (large refactor; caching addresses the hot path).
- Server-side session revocation store (current tokens are self-contained HMAC + expiry).
- Rewriting all historical public file URLs in the DB (new uploads are signed; apply private-bucket migration + re-save critical docs if needed).
- Removing leftover blob `parseOperationsPayload` helpers in `operations-fns.ts` (dead path, still unused; safe cleanup later).

---

## Verify locally

1. Ensure `.env` has `ADMARK_APP_PASSWORD` and preferably `APP_SESSION_SECRET`.
2. Restart the app; log in again.
3. Open `/ops` — KPIs and EMI next/final amounts should stay correct.
4. Apply the private-bucket SQL in Supabase when ready.
