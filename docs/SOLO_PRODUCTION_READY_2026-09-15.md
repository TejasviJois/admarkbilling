# Solo production readiness — 15 Sep 2026

Target: **one operator**, shared portal password, internal Admark use (not multi-user SaaS).

## Done

| Item | Status |
|------|--------|
| Portal login (`ADMARK_APP_USERNAME` / `ADMARK_APP_PASSWORD`) on Vercel Production + Preview | Set |
| `APP_SESSION_SECRET` on Production + Preview (encrypt + session cookies) | Set |
| Relational reads/writes enabled on Vercel | Set |
| `admark-files` storage bucket **private** | Confirmed `public: false` |
| Uploads return **signed URLs** only (no public URL fallback) | Code |
| Auth FATAL checks server-only (client no longer crashes Sign in) | Code |
| Session cookies: per-login `jti` + expiry + HMAC | Code |
| Login rate limit | Code |
| Legacy public table grants revoked; service_role path | Migrations |
| Partnerships / Valuation / Assignments opt-in via Settings | Code |

## Operator checklist

1. Sign in: username `AdmarkDigitals` (or `Admark Digitals`), password from Vercel / `.env`.
2. Turn on optional modules in **Settings → Finance rules** only when needed (Partnerships, Valuation, Assignments).
3. After deploy, hard-refresh once if the login page looks stuck.
4. Old file links that used public URLs may need a page open (signed refresh) or re-upload.

## Out of scope (solo)

- Per-user accounts / RBAC
- Server-side session revocation store
- Strong password policy for the shared portal password
