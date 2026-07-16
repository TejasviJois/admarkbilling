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
import { useOperations } from "@/hooks/use-operations";
import { useInvoices } from "@/hooks/use-invoices";
import { useDocuments } from "@/hooks/use-documents";
import { syncSystemNotifications } from "@/lib/notification-engine";
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
  { to: "/notifications", label: "Notifications" },
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
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const { ops, persist } = useOperations();
  const { invoices } = useInvoices();
  const { docs } = useDocuments();
  const { company } = useCompany();

  const brandLogo = companyLogoSrc(company);
  const isLogin = path === "/login";

  useEffect(() => {
    void getDataBackendStatus()
      .then((s) => setServerDb(s.configured))
      .catch(() => setServerDb(false));
  }, []);

  // Central Notification Sync
  useEffect(() => {
    if (!ops || !invoices || !docs || serverDb === null) return;

    const synced = syncSystemNotifications(ops, invoices, docs.agreements ?? [], serverDb);
    const originalIds = (ops.notifications ?? []).map((n) => `${n.id}-${n.read}`).join(",");
    const syncedIds = synced.map((n) => `${n.id}-${n.read}`).join(",");

    if (originalIds !== syncedIds) {
      persist({ ...ops, notifications: synced });
    }
  }, [ops, invoices, docs, serverDb, persist]);

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

  const notificationsList = ops?.notifications ?? [];
  const unreadNotificationsCount = notificationsList.filter((n) => !n.read).length;

  const handleToggleRead = (id: string) => {
    if (!ops) return;
    const updated = notificationsList.map((n) => (n.id === id ? { ...n, read: !n.read } : n));
    persist({ ...ops, notifications: updated });
  };

  const handleMarkAllRead = () => {
    if (!ops) return;
    const updated = notificationsList.map((n) => ({ ...n, read: true }));
    persist({ ...ops, notifications: updated });
  };

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
      
      {/* Desktop Sidebar */}
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
              <span className="flex items-center justify-between w-full">
                <span>{label}</span>
                {to === "/notifications" && unreadNotificationsCount > 0 && (
                  <span className="bg-primary text-primary-foreground font-bold px-1.5 py-0.5 rounded-full text-[9px] min-w-4 text-center">
                    {unreadNotificationsCount}
                  </span>
                )}
              </span>
            </Link>
          ))}
        </nav>
      </aside>

      {/* Right Area */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Header Bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          
          {/* Left: Mobile branding */}
          <div className="flex items-center gap-3 md:hidden">
            <Link to="/" className="flex items-center shrink-0">
              <img
                src={brandLogo}
                alt="Admark Digitals Logo"
                className="h-9 w-auto object-contain"
              />
            </Link>
          </div>

          <div className="hidden md:block">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest bg-muted/60 px-2.5 py-1 rounded">
              Admark Operating System
            </span>
          </div>

          {/* Right Area */}
          <div className="flex items-center gap-3">
            
            {/* Notification Drawer Sheet Trigger */}
            <Sheet open={notificationsOpen} onOpenChange={setNotificationsOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className="relative p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Notifications"
                >
                  <Bell className="h-5 w-5" />
                  {unreadNotificationsCount > 0 && (
                    <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white ring-2 ring-background">
                      {unreadNotificationsCount}
                    </span>
                  )}
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="flex w-full max-w-[min(100vw,24rem)] flex-col sm:max-w-md">
                <SheetTitle className="text-left font-bold text-foreground border-b border-border pb-3 flex items-center justify-between">
                  <span>Notifications</span>
                  {unreadNotificationsCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      Mark all read
                    </button>
                  )}
                </SheetTitle>
                
                <div className="flex-1 overflow-y-auto mt-4 space-y-3 pr-1">
                  {notificationsList.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground">
                      <Bell className="mx-auto h-8 w-8 opacity-40 animate-pulse mb-2 text-muted-foreground" />
                      <p className="text-sm font-semibold">All caught up!</p>
                    </div>
                  ) : (
                    notificationsList.map((item) => (
                      <div
                        key={item.id}
                        className={`p-3 rounded-lg border text-xs transition-all relative ${
                          item.read
                            ? "bg-card/45 border-border/70 opacity-80"
                            : "bg-card border-border shadow-sm hover:border-primary/40"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-bold text-foreground leading-snug">{item.title}</h4>
                          <span className={`h-1.5 w-1.5 rounded-full shrink-0 mt-1.5 ${item.read ? "bg-transparent" : "bg-primary animate-pulse"}`} />
                        </div>
                        <p className="text-muted-foreground mt-1 leading-normal">{item.message}</p>
                        <div className="mt-2.5 flex items-center justify-between">
                          <span className="text-[9px] text-muted-foreground font-semibold tabular-nums">{item.timestamp}</span>
                          <div className="flex items-center gap-1.5">
                            {item.actionUrl && (
                              <button
                                onClick={() => {
                                  setNotificationsOpen(false);
                                  void router.navigate({ to: item.actionUrl });
                                }}
                                className="text-[10px] bg-primary text-primary-foreground px-2 py-0.5 rounded font-bold hover:bg-primary/90"
                              >
                                {item.actionLabel || "View"}
                              </button>
                            )}
                            <button
                              onClick={() => handleToggleRead(item.id)}
                              className="text-muted-foreground hover:text-foreground text-[10px] font-semibold"
                            >
                              {item.read ? "Unread" : "Read"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="border-t border-border pt-4">
                  <Link
                    to="/notifications"
                    onClick={() => setNotificationsOpen(false)}
                    className="block w-full text-center text-xs font-bold bg-muted hover:bg-muted/80 text-foreground py-2.5 rounded-lg transition-colors"
                  >
                    View All Activity Logs
                  </Link>
                </div>
              </SheetContent>
            </Sheet>

            {/* Mobile menu trigger */}
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
                        <span className="flex items-center justify-between w-full">
                          <span>{label}</span>
                          {to === "/notifications" && unreadNotificationsCount > 0 && (
                            <span className="bg-primary text-primary-foreground font-bold px-1.5 py-0.5 rounded-full text-[9px] min-w-4 text-center">
                              {unreadNotificationsCount}
                            </span>
                          )}
                        </span>
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

            {/* Signout Button */}
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
