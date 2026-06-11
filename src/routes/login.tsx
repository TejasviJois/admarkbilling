import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LogIn } from "lucide-react";

import { DEFAULT_PUBLIC_LOGO_URL } from "@/lib/constants";
import { clearAuthStatusCache, getAuthStatusCached } from "@/lib/auth-status-cache";
import { logClientError } from "@/lib/client-logger";
import { loginFn } from "@/server/auth-fns";

export const Route = createFileRoute("/login")({
  validateSearch: (raw: Record<string, unknown>) => ({
    redirect:
      typeof raw.redirect === "string" && raw.redirect.startsWith("/") && !raw.redirect.startsWith("//")
        ? raw.redirect
        : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const { ok } = await getAuthStatusCached();
    if (ok) {
      throw redirect({ to: search.redirect ?? "/" });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { redirect: redirectTo } = Route.useSearch();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    void loginFn({ data: { username, password } })
      .then(() => {
        clearAuthStatusCache();
        void navigate({ to: redirectTo ?? "/", replace: true });
      })
      .catch((err: unknown) => {
        logClientError("login.submit", err);
        setError(err instanceof Error ? err.message : "Sign-in failed.");
      })
      .finally(() => setPending(false));
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <img src={DEFAULT_PUBLIC_LOGO_URL} alt="Admark Digitals" className="h-16 w-auto max-w-[220px] object-contain" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
            <p className="mt-1 text-sm text-muted-foreground">Admark Billing — internal access</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Username
            </span>
            <input
              autoComplete="username"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Admark Digitals"
              disabled={pending}
            />
            <span className="mt-1 block text-[11px] text-muted-foreground">Not case-sensitive</span>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Password
            </span>
            <input
              type="password"
              autoComplete="current-password"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={pending}
            />
            <span className="mt-1 block text-[11px] text-muted-foreground">Case-sensitive</span>
          </label>

          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          >
            <LogIn className="h-4 w-4" aria-hidden />
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
