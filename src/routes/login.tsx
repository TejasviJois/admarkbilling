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
    <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center px-4 py-10">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-500/15 blur-[90px]" />

      <div className="rounded-[32px] border border-white/10 bg-[#141419]/90 p-8 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] backdrop-blur-3xl sm:p-10">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <img
            src={DEFAULT_PUBLIC_LOGO_URL}
            alt="Admark"
            className="h-14 w-auto max-w-[280px] object-contain drop-shadow-[0_4px_20px_rgba(255,107,43,0.35)]"
          />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Sign in</h1>
            <p className="mt-1 text-xs font-medium text-white/50">
              Admark Operating System — Internal Portal
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-5">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-white/50">
              Username
            </span>
            <input
              autoComplete="username"
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none transition-all focus:border-orange-500/60 focus:bg-white/[0.07] focus:ring-1 focus:ring-orange-500/40"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Admark Digitals"
              disabled={pending}
            />
            <span className="mt-1 block text-[11px] text-white/40">Not case-sensitive</span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-white/50">
              Password
            </span>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 pr-11 text-sm text-white placeholder-white/30 outline-none transition-all focus:border-orange-500/60 focus:bg-white/[0.07] focus:ring-1 focus:ring-orange-500/40"
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
                className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center text-white/40 transition hover:text-white disabled:pointer-events-none disabled:opacity-50"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <span className="mt-1 block text-[11px] text-white/40">Case-sensitive</span>
          </label>

          {error && (
            <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs font-semibold text-rose-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#ff6b2b] to-[#f04400] text-sm font-bold text-white shadow-lg shadow-orange-500/35 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
          >
            <LogIn className="h-4 w-4" aria-hidden />
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
