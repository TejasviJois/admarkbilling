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
import { LogOut, Menu, Bell, Shield } from "lucide-react";

import appCss from "../styles.css?url";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { PUBLIC_HOME_URL } from "@/lib/constants";
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

const navLinkClass = (active: boolean) => {
  const base = "flex w-full items-center justify-start gap-2.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200";
  const tone = active
    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
    : "text-muted-foreground hover:bg-muted hover:text-foreground";
  return `${base} ${tone}`;
};

type NavLinkItem = { to: string; label: string; exact?: boolean };

const MAIN_NAV_LINKS: NavLinkItem[] = [
  { to: "/", label: "Dashboard", exact: true },
  { to: "/clients", label: "Clients" },
  { to: "/transactions", label: "Transactions" },
  { to: "/expenses", label: "Expenses" },
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

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  );
}

function AppShell() {
  const router = useRouter();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [serverDb, setServerDb] = useState<boolean | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Safely call useCompany inside AppShell now since it is wrapped in QueryClientProvider context!
  const { company } = useCompany();
  const brandLogo = companyLogoSrc(company);

  const isLogin = path === "/login";

  useEffect(() => {
    void getDataBackendStatus()
      .then((s) => setServerDb(s.configured))
      .catch(() => setServerDb(false));
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [path]);

  const handleSignOut = () => {
    void logoutFn()
      .then(() => {
        clearAuthStatusCache();
        return router.navigate({ to: "/login", replace: true, search: { redirect: undefined } });
      })
      .catch((e) => logClientError("appShell.signOut", e));
  };

  const isActive = (to: string, exact?: boolean) =>
    exact ? path === to : path === to || path.startsWith(`${to}/`);

  if (isLogin) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <main className="mx-auto min-h-screen max-w-none">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      
      {/* Desktop Sidebar: Visible on md and larger */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border bg-card shrink-0 sticky top-0 h-screen">
        <div className="flex h-16 items-center border-b border-border px-6">
          <Link to="/" className="flex items-center shrink-0">
            <img
              src={brandLogo}
              alt="Admark Digitals Logo"
              className="h-10 w-auto max-h-10 object-contain"
            />
          </Link>
        </div>
        
        <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-1.5" aria-label="Sidebar main navigation">
          {MAIN_NAV_LINKS.map(({ to, label, exact }) => (
            <Link
              key={to}
              to={to}
              preload="intent"
              className={navLinkClass(isActive(to, exact))}
            >
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Right Area: Header, Warnings, and Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Header Bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          
          {/* Left: Mobile branding (hidden on desktop) */}
          <div className="flex items-center gap-3 md:hidden">
            <Link to="/" className="flex items-center shrink-0">
              <img
                src={brandLogo}
                alt="Admark Digitals Logo"
                className="h-9 w-auto object-contain"
              />
            </Link>
          </div>

          {/* Left: Desktop label placeholder (hidden on mobile) */}
          <div className="hidden md:block">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest bg-muted/60 px-2.5 py-1 rounded">
              Admark Operating System
            </span>
          </div>

          {/* Right: Notifications, Logout, Mobile Hamburger Menu */}
          <div className="flex items-center gap-3">
            {/* Notification icon with dummy trigger */}
            <button
              type="button"
              className="relative p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute top-1.5 right-1.5 block h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-background" />
            </button>

            {/* Mobile menu sheet trigger (visible below md) */}
            <div className="md:hidden">
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-muted"
                    aria-expanded={mobileMenuOpen}
                    aria-label="Open sidebar menu"
                  >
                    <Menu className="h-5 w-5" strokeWidth={2} />
                  </button>
                </SheetTrigger>
                <SheetContent side="left" className="flex w-full max-w-[min(100vw,20rem)] flex-col sm:max-w-sm">
                  <SheetTitle className="text-left font-bold text-foreground border-b border-border pb-3 flex items-center gap-2">
                    Navigation Menu
                  </SheetTitle>
                  <nav className="mt-4 flex flex-col gap-1 overflow-y-auto flex-1">
                    {MAIN_NAV_LINKS.map(({ to, label, exact }) => (
                      <Link
                        key={to}
                        to={to}
                        preload="intent"
                        className={navLinkClass(isActive(to, exact))}
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        {label}
                      </Link>
                    ))}
                  </nav>
                  <div className="border-t border-border pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        handleSignOut();
                      }}
                      className="inline-flex w-full items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-rose-500 hover:bg-rose-500/10 transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>Sign out</span>
                    </button>
                  </div>
                </SheetContent>
              </Sheet>
            </div>

            {/* Signout Button (Desktop only) */}
            <button
              type="button"
              onClick={handleSignOut}
              className="hidden md:inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-xs font-bold hover:bg-muted text-foreground transition-all duration-200"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4 shrink-0" strokeWidth={2.5} />
              <span>Sign out</span>
            </button>
          </div>
        </header>

        {/* Warning Banner */}
        {serverDb === false && (
          <div className="border-b border-amber-500/25 bg-amber-950/35 px-6 py-3 text-center text-xs text-amber-100 flex items-center justify-center gap-2">
            <Shield className="h-4 w-4 text-amber-500 shrink-0" />
            <span>
              Server database is not configured — data stays in this browser only. Set{" "}
              <code className="rounded bg-amber-500/15 px-1 font-mono text-amber-50">SUPABASE_URL</code>{" "}
              and{" "}
              <code className="rounded bg-amber-500/15 px-1 font-mono text-amber-50">
                SUPABASE_SERVICE_ROLE_KEY
              </code>{" "}
              in <code className="rounded bg-amber-500/15 px-1 font-mono text-amber-50">.env</code>.
            </span>
          </div>
        )}

        {/* Main Outlet */}
        <main className="flex-1 overflow-y-auto px-6 py-8">
          <div className="max-w-6xl mx-auto">
            <Outlet />
          </div>
        </main>
        
      </div>
    </div>
  );
}
