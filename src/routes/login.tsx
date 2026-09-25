import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, LogIn } from "lucide-react";

import { DEFAULT_PUBLIC_LOGO_URL } from "@/lib/constants";
import {
  clearAuthStatusCache,
  getAuthStatusCached,
  setAuthStatusCache,
} from "@/lib/auth-status-cache";
import { logClientError } from "@/lib/client-logger";
import { loginFn } from "@/server/auth-fns";

export const Route = createFileRoute("/login")({
  validateSearch: (raw: Record<string, unknown>) => {
    // Keep only a clean same-origin pathname — query strings or hashes here
    // would be treated as a route path after login and render a 404.
    const value = typeof raw.redirect === "string" ? raw.redirect.split(/[?#]/)[0] : "";
    return {
      redirect: value.startsWith("/") && !value.startsWith("//") ? value : undefined,
    };
  },
  beforeLoad: async ({ search }) => {
    const status = await getAuthStatusCached();
    if (status.ok) {
      throw redirect({
        to: status.role === "sales" ? "/lead-list" : (search.redirect ?? "/"),
      });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { redirect: redirectTo } = Route.useSearch();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    void loginFn({ data: { username, password } })
      .then((result) => {
        clearAuthStatusCache();
        setAuthStatusCache({
          ok: true,
          role: result.role,
          userId: result.userId,
          teamMemberId: result.teamMemberId,
          displayName: result.displayName,
        });
        const dest =
          result.role === "sales" ? "/lead-list" : (redirectTo ?? "/");
        void navigate({ to: dest, replace: true });
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
          <img
            src={DEFAULT_PUBLIC_LOGO_URL}
            alt="Admark Digitals"
            className="h-16 w-auto max-w-[220px] object-contain"
          />
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
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                className="w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={pending}
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((value) => !value)}
                disabled={pending}
                className="absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center text-muted-foreground transition hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
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
