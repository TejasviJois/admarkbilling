# Admark Invoice Assistant

Full-stack invoice app: **TanStack Start** (React 19) + **Vite** + **Nitro (Vercel preset)**, with **Supabase** accessed only from **server functions** (service role — never sent to the browser).

## 1. Database (one SQL file)

1. Supabase → **SQL** → New query.
2. Paste the entire contents of **`supabase/admark_billing.sql`** and run it.
3. You can re-run the same script; it is written to avoid duplicate-object errors.

Tables: **`invoices`** (`id`, `payload` jsonb, `created_at`) and **`company_settings`** (`id`, `payload`, `updated_at`). RLS is **off** so policies cannot hide rows; the app uses the **service role** on the server.

## 2. Environment

Create a **`.env`** file in the project root for local development (`.env` is gitignored). Copy from **`.env.example`** or use the same keys in **Vercel** → **Settings → Environment Variables** (you can **Import** from `.env.example` after cloning, then fill values).

| Variable                      | Where to get it / notes                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| `SUPABASE_URL`                | Project **Settings → API → Project URL** (**required** on Vercel)                       |
| `SUPABASE_SERVICE_ROLE_KEY`   | **Settings → API → service_role** (secret; server only; **required** on Vercel)       |
| `APP_SESSION_SECRET`          | Long random string (e.g. `openssl rand -hex 32`). **Required on Vercel** — signs the login cookie. |
| `ADMARK_APP_PASSWORD`         | Your production portal password. **Required on Vercel** (case-sensitive).             |
| `ADMARK_APP_USERNAME`         | Optional. Portal username (default **`Admark Digitals`**). Matching is **not** case-sensitive; spaces are normalized. |
| `VITE_PUBLIC_HOME_URL`        | Optional. **Home** nav URL. Defaults to **`/`** (this app’s dashboard). Set to an absolute URL only if **Home** should open an external site. |

Restart the dev server after changing `.env`:

```bash
npm run dev
```

## 3. How data flows

- The app shows a **sign-in** page until a valid session cookie is set (username / password checked on the server). **Supabase** server functions also require that cookie.

- UI calls helpers in **`src/lib/storage.ts`**.
- When the server reports Supabase is configured, those helpers call **`src/server/invoice-fns.ts`** (`createServerFn`), which uses **`SUPABASE_SERVICE_ROLE_KEY`** in **`src/server/supabase-admin.ts`**.
- If env is missing, the UI falls back to **localStorage** and shows an amber banner.

Features covered end-to-end: **list invoices**, **get invoice**, **create/update invoice**, **delete invoice**, **load/save company settings** (same as dashboard, new invoice, history, settings, PDF flows).

## 4. Deploy to Vercel

1. Push the repo to GitHub and **Import** the project in [Vercel](https://vercel.com/).
2. **Build command:** `npm run build` (see `vercel.json`). The Nitro **Vercel** preset writes **`.vercel/output`**; Vercel runs that output as serverless + static assets.
3. In the Vercel project, add variables from **`.env.example`**. **Required for production:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_SESSION_SECRET`, and `ADMARK_APP_PASSWORD`. Optionally set `ADMARK_APP_USERNAME` and `VITE_PUBLIC_HOME_URL`. Enable **Production** and **Preview** for each secret so builds and branches never run without them.
4. Run **`supabase/admark_billing.sql`** in your Supabase SQL editor (creates `invoices`, `company_settings`, `operations_data` tables).
5. Deploy. Use Vercel **Functions** logs or the browser **Network** tab if server calls fail.

`vercel.json` pins install/build commands. **`package.json`** `engines.node` matches the Nitro/Vercel Node runtime.

## 5. Cursor MCP (optional)

`.cursor/mcp.json` can point at Supabase MCP; sign in when Cursor prompts.

## 6. Supabase agent skills (optional)

```bash
npx skills add supabase/agent-skills
```

## 7. Scripts

| Script            | Description                                    |
| ----------------- | ---------------------------------------------- |
| `npm run dev`     | Dev server (default **http://localhost:3000**) |
| `npm run build`   | Production build (Nitro → `.vercel/output`)    |
| `npm run preview` | Preview build (`vite preview`)                 |
| `npm run lint`    | ESLint                                         |

## 8. Cloudflare Workers (optional)

The repo may still include **`wrangler.jsonc`** from an earlier setup. Production is oriented toward **Vercel + Nitro**; to deploy on Cloudflare again you would re-add **`@cloudflare/vite-plugin`** and follow the [TanStack Cloudflare hosting guide](https://tanstack.com/start/latest/docs/framework/react/guide/hosting#cloudflare-workers--official-partner).
