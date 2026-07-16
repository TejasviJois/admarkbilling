import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  redirect,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Home, LogOut, Menu } from "lucide-react";

import appCss from "../styles.css?url";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { DEFAULT_PUBLIC_LOGO_URL, PUBLIC_HOME_URL } from "@/lib/constants";
import { logClientError } from "@/lib/client-logger";
import { companyLogoSrc } from "@/lib/company-branding";
import { getAuthStatusCached, clearAuthStatusCache } from "@/lib/auth-status-cache";
import { prefetchAppData } from "@/lib/prefetch-app-data";
import { useCompany } from "@/hooks/use-company";
import { getDataBackendStatus } from "@/server/invoice-fns";
import { logoutFn } from "@/server/auth-fns";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  logClientError("route-error-boundary", error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: async ({ location, context }) => {
    if (location.pathname === "/login") return;
    const { ok } = await getAuthStatusCached();
    if (!ok) {
      const path = location.pathname + (location.searchStr || "");
      throw redirect({
        to: "/login",
        search: { redirect: path || "/" },
      });
    }
    prefetchAppData(context.queryClient);
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Admark Billing — Operations" },
      { name: "description", content: "Internal operations, billing & invoice automation for Admark." },
    ],
    links: [
      { rel: "icon", href: "/favicon.png", type: "image/png", sizes: "48x48" },
      { rel: "icon", href: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=IBM+Plex+Serif:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

const navLinkClass = (active: boolean, dense?: boolean) => {
  const base = dense
    ? "inline-flex w-full items-center justify-start gap-2 rounded-md px-4 py-3 text-base font-medium transition-colors"
    : "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors md:px-2.5 md:py-2 lg:gap-2 lg:px-3 lg:text-sm";
  const tone = active
    ? "bg-primary/15 text-primary"
    : "text-muted-foreground hover:bg-muted hover:text-foreground";
  return `${base} ${tone}`;
};

type NavLinkItem = { to: string; label: string; exact?: boolean };

const MAIN_NAV_LINKS: NavLinkItem[] = [
  { to: "/", label: "Dashboard", exact: true },
  { to: "/clients", label: "Clients" },
  { to: "/transactions", label: "Transactions" },
  { to: "/founders", label: "Founders" },
  { to: "/analytics", label: "Analytics" },
  { to: "/projects", label: "Projects" },
  { to: "/partnerships", label: "Partnerships" },
  { to: "/leads", label: "Leads" },
  { to: "/accounts", label: "Accounts" },
  { to: "/invoices", label: "Invoices" },
  { to: "/documents", label: "Documents" },
  { to: "/logs", label: "Logs" },
  { to: "/settings", label: "Settings" },
];

function TopNav() {
  const router = useRouter();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { company } = useCompany();
  const brandLogo = companyLogoSrc(company);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleSignOut = () => {
    void logoutFn()
      .then(() => {
        clearAuthStatusCache();
        return router.navigate({ to: "/login", replace: true, search: { redirect: undefined } });
      })
      .catch((e) => logClientError("topNav.signOut", e));
  };

  useEffect(() => {
    setMenuOpen(false);
  }, [path]);

  if (path === "/login") return null;

  const isActive = (to: string, exact?: boolean) =>
    exact ? path === to : path === to || path.startsWith(`${to}/`);
  const homeIsExternal = /^https?:\/\//i.test(PUBLIC_HOME_URL);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-4 sm:h-16 sm:gap-3 sm:px-6">
        <Link
          to="/"
          aria-label="Dashboard"
          className="flex min-w-0 shrink-0 items-center rounded-sm py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <img
            src={brandLogo}
            alt="Admark Digitals"
            className="h-10 w-auto max-h-10 object-contain sm:h-12 sm:max-h-12"
          />
        </Link>

        {/* Tablet / desktop navigation — visible from md (768px) up */}
        <nav
          aria-label="Main"
          className="hidden min-w-0 flex-1 items-center justify-end gap-0.5 md:flex lg:gap-1"
        >
          {homeIsExternal && (
            <a
              href={PUBLIC_HOME_URL}
              rel="noopener noreferrer"
              className={navLinkClass(false)}
              aria-label="Home (external site)"
            >
              <Home className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              Home
            </a>
          )}
          {MAIN_NAV_LINKS.map(({ to, label, exact }) => (
            <Link key={to} to={to} preload="intent" className={navLinkClass(isActive(to, exact))}>
              {label}
            </Link>
          ))}
          <button
            type="button"
            onClick={handleSignOut}
            className={navLinkClass(false)}
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            <span className="hidden lg:inline">Sign out</span>
          </button>
        </nav>

        {/* Mobile menu — phones only (below md) */}
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-muted md:hidden"
              aria-expanded={menuOpen}
              aria-controls="mobile-main-nav"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" strokeWidth={2} />
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="flex w-full max-w-[min(100vw,20rem)] flex-col sm:max-w-sm">
            <SheetTitle className="sr-only">Main navigation</SheetTitle>
            <nav
              id="mobile-main-nav"
              className="mt-6 flex flex-col gap-1"
              aria-label="Main mobile"
            >
              {homeIsExternal && (
                <a
                  href={PUBLIC_HOME_URL}
                  rel="noopener noreferrer"
                  className={navLinkClass(false, true)}
                  onClick={() => setMenuOpen(false)}
                >
                  <Home className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
                  Home
                </a>
              )}
              {MAIN_NAV_LINKS.map(({ to, label, exact }) => (
                <Link
                  key={to}
                  to={to}
                  preload="intent"
                  className={navLinkClass(isActive(to, exact), true)}
                  onClick={() => setMenuOpen(false)}
                >
                  {label}
                </Link>
              ))}
              <button
                type="button"
                className={navLinkClass(false, true)}
                onClick={() => {
                  setMenuOpen(false);
                  handleSignOut();
                }}
              >
                <LogOut className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
                Sign out
              </button>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const [serverDb, setServerDb] = useState<boolean | null>(null);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isLogin = path === "/login";

  useEffect(() => {
    void getDataBackendStatus()
      .then((s) => setServerDb(s.configured))
      .catch(() => setServerDb(false));
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-background text-foreground">
        {!isLogin && <TopNav />}
        {!isLogin && serverDb === false && (
          <div className="border-b border-amber-500/25 bg-amber-950/35 px-4 py-2.5 text-center text-xs text-amber-100 sm:px-6">
            Server database is not configured — data stays in this browser only. Set{" "}
            <code className="rounded bg-amber-500/15 px-1 font-mono text-amber-50">SUPABASE_URL</code>{" "}
            and{" "}
            <code className="rounded bg-amber-500/15 px-1 font-mono text-amber-50">
              SUPABASE_SERVICE_ROLE_KEY
            </code>{" "}
            in{" "}
            <code className="rounded bg-amber-500/15 px-1 font-mono text-amber-50">.env</code>, restart{" "}
            <code className="rounded bg-amber-500/15 px-1 font-mono text-amber-50">npm run dev</code>, then run{" "}
            <code className="rounded bg-amber-500/15 px-1 font-mono text-amber-50">
              supabase/admark_billing.sql
            </code>{" "}
            in the Supabase SQL editor.
          </div>
        )}
        <main
          className={
            isLogin
              ? "mx-auto min-h-[calc(100dvh-0px)] max-w-none"
              : "mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8"
          }
        >
          <Outlet />
        </main>
      </div>
    </QueryClientProvider>
  );
}
