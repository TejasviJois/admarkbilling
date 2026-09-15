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
import {
  LogOut,
  Menu,
  Shield,
  PanelLeftClose,
  PanelLeftOpen,
  LayoutDashboard,
  Users,
  BriefcaseBusiness,
  CalendarDays,
  WalletCards,
  BarChart3,
  TrendingUp,
  Settings,
  ChevronRight,
  Circle,
} from "lucide-react";

import appCss from "../styles.css?url";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";
import { PUBLIC_HOME_URL } from "@/lib/constants";
import { logClientError } from "@/lib/client-logger";
import { companyLogoSrc } from "@/lib/company-branding";
import { getAuthStatusCached, clearAuthStatusCache } from "@/lib/auth-status-cache";
import { prefetchAppData } from "@/lib/prefetch-app-data";
import { useCompany } from "@/hooks/use-company";
import { isServerApiConfigured } from "@/lib/backend-status-cache";
import { logoutFn } from "@/server/auth-fns";
import { safeLocalStorageSet } from "@/lib/browser-storage";

function NotFoundComponent() {
  const router = useRouter();

  // Stale bookmarks / phone home-screen URLs land on paths that no longer
  // exist — bounce straight to the dashboard instead of a dead-end 404.
  useEffect(() => {
    void router.navigate({ to: "/", replace: true });
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This page doesn't exist — redirecting to the dashboard.
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
      // Pathname only — query strings (e.g. WhatsApp/utm tracking params) are
      // not route paths, and navigating to them after login rendered a 404.
      throw redirect({
        to: "/login",
        search: { redirect: location.pathname || "/" },
      });
    }
    prefetchAppData(context.queryClient);
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Admark Billing — Operations" },
      {
        name: "description",
        content: "Internal operations, billing & invoice automation for Admark.",
      },
    ],
    links: [
      // ?v= busts stale browser caches whenever the icon artwork changes.
      { rel: "icon", href: "/favicon.png?v=2026a", type: "image/png", sizes: "48x48" },
      { rel: "icon", href: "/favicon-32.png?v=2026a", type: "image/png", sizes: "32x32" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png?v=2026a", sizes: "180x180" },
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
        <Toaster position="top-right" closeButton richColors />
        <Scripts />
      </body>
    </html>
  );
}

const navLinkClass = (active: boolean) => {
  const base =
    "flex w-full items-center justify-start gap-2.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200";
  const tone = active
    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
    : "text-muted-foreground hover:bg-muted hover:text-foreground";
  return `${base} ${tone}`;
};

type NavLinkItem = { to: string; label: string; exact?: boolean };
type NavGroupId = "crm" | "delivery" | "workspace" | "finance" | "administration";
type NavGroup = {
  id: NavGroupId;
  label: string;
  icon: typeof Users;
  section: "Daily Work" | "Business Intelligence" | "System";
  items: NavLinkItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    id: "crm",
    label: "CRM",
    icon: Users,
    section: "Daily Work",
    items: [
      { to: "/directory", label: "Directory" },
      { to: "/leads", label: "Pipeline" },
      { to: "/clients", label: "Clients" },
    ],
  },
  {
    id: "delivery",
    label: "Delivery",
    icon: BriefcaseBusiness,
    section: "Daily Work",
    items: [
      { to: "/team", label: "Team" },
      { to: "/projects", label: "Projects" },
      { to: "/partnerships", label: "Partnerships" },
    ],
  },
  {
    id: "workspace",
    label: "Workspace",
    icon: CalendarDays,
    section: "Daily Work",
    items: [
      { to: "/calendar", label: "Schedules & Reminders" },
      { to: "/documents", label: "Documents" },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    icon: WalletCards,
    section: "Daily Work",
    items: [
      { to: "/accounts", label: "Accounts" },
      { to: "/ops", label: "Office & Ops" },
      { to: "/invoices", label: "Invoices" },
    ],
  },
  {
    id: "administration",
    label: "Administration",
    icon: Settings,
    section: "System",
    items: [
      { to: "/settings", label: "Settings" },
      { to: "/logs", label: "Activity Logs" },
    ],
  },
];

const NAV_EXPANSION_STORAGE_KEY = "admark.navigation.expanded-groups";

function SidebarNavigation({
  path,
  expandedGroups,
  onToggleGroup,
  showValuation,
  onNavigate,
}: {
  path: string;
  expandedGroups: NavGroupId[];
  onToggleGroup: (id: NavGroupId, keepOthers: boolean) => void;
  showValuation: boolean;
  onNavigate?: () => void;
}) {
  const isActive = (to: string, exact?: boolean) =>
    exact ? path === to : path === to || path.startsWith(`${to}/`);

  const renderGroup = (group: NavGroup) => {
    const items = group.items;
    const expanded = expandedGroups.includes(group.id);
    const active = items.some((item) => isActive(item.to, item.exact));
    const GroupIcon = group.icon;
    const regionId = `nav-group-${group.id}`;

    return (
      <div key={group.id} className="space-y-1">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={regionId}
          title="Expand section. Hold Shift to keep other sections open."
          onClick={(event) => onToggleGroup(group.id, event.shiftKey)}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
            active
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <GroupIcon className="h-4 w-4 shrink-0" strokeWidth={2} />
          <span className="flex-1 text-left">{group.label}</span>
          <ChevronRight
            className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
              expanded ? "rotate-90" : ""
            }`}
          />
        </button>
        <div
          id={regionId}
          className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
            expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="overflow-hidden">
            <div className="ml-5 space-y-0.5 border-l border-border/80 pb-1 pl-3 pt-0.5">
              {items.map(({ to, label, exact }) => {
                const childActive = isActive(to, exact);
                return (
                  <Link
                    key={to}
                    to={to}
                    preload="intent"
                    tabIndex={expanded ? 0 : -1}
                    aria-current={childActive ? "page" : undefined}
                    onClick={onNavigate}
                    className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors ${
                      childActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Circle
                      className={`h-1.5 w-1.5 shrink-0 ${
                        childActive ? "fill-current" : "fill-muted-foreground/35"
                      }`}
                    />
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-5" aria-label="Primary navigation">
      <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70">
        Daily Work
      </p>
      <Link
        to="/"
        preload="intent"
        aria-current={path === "/" ? "page" : undefined}
        onClick={onNavigate}
        className={navLinkClass(path === "/")}
      >
        <LayoutDashboard className="h-4 w-4 shrink-0" />
        Dashboard
      </Link>
      <div className="mt-1 space-y-1">
        {NAV_GROUPS.filter((group) => group.section === "Daily Work").map(renderGroup)}
      </div>

      <p className="mb-2 mt-6 border-t border-border/70 px-3 pt-5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70">
        Business Intelligence
      </p>
      <div className="space-y-1">
        <Link
          to="/analytics"
          preload="intent"
          aria-current={isActive("/analytics") ? "page" : undefined}
          onClick={onNavigate}
          className={navLinkClass(isActive("/analytics"))}
        >
          <BarChart3 className="h-4 w-4 shrink-0" />
          Analytics
        </Link>
        {showValuation && (
          <Link
            to="/valuation"
            preload="intent"
            aria-current={isActive("/valuation") ? "page" : undefined}
            onClick={onNavigate}
            className={navLinkClass(isActive("/valuation"))}
          >
            <TrendingUp className="h-4 w-4 shrink-0" />
            Company Valuation
          </Link>
        )}
      </div>

      <p className="mb-2 mt-6 border-t border-border/70 px-3 pt-5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70">
        System
      </p>
      <div className="space-y-1">
        {NAV_GROUPS.filter((group) => group.section === "System").map(renderGroup)}
      </div>
    </nav>
  );
}

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
  const [expandedNavGroups, setExpandedNavGroups] = useState<NavGroupId[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const { company } = useCompany();

  const brandLogo = companyLogoSrc(company);
  const isLogin = path === "/login";

  useEffect(() => {
    void isServerApiConfigured()
      .then(setServerDb)
      .catch(() => setServerDb(false));
  }, []);

  useEffect(() => {
    // Dark mode only — clear any previously saved light-theme preference.
    window.localStorage.removeItem("admark.theme");
    document.documentElement.classList.remove("light");
    document.documentElement.classList.add("dark");
  }, []);

  useEffect(() => {
    setSidebarCollapsed(window.localStorage.getItem("admark.sidebar.collapsed") === "1");
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      safeLocalStorageSet("admark.sidebar.collapsed", next ? "1" : "0");
      return next;
    });
  };

  useEffect(() => {
    let savedGroups: NavGroupId[] = [];
    try {
      const saved = JSON.parse(
        window.localStorage.getItem(NAV_EXPANSION_STORAGE_KEY) ?? "[]",
      ) as string[];
      savedGroups = saved.filter((id): id is NavGroupId =>
        NAV_GROUPS.some((group) => group.id === id),
      );
    } catch {
      savedGroups = [];
    }
    setExpandedNavGroups(savedGroups);
  }, []);

  useEffect(() => {
    const activeGroup = NAV_GROUPS.find((group) =>
      group.items.some((item) => path === item.to || path.startsWith(`${item.to}/`)),
    )?.id;
    if (!activeGroup) return;
    setExpandedNavGroups((current) => (current.includes(activeGroup) ? current : [activeGroup]));
  }, [path]);

  useEffect(() => {
    safeLocalStorageSet(NAV_EXPANSION_STORAGE_KEY, JSON.stringify(expandedNavGroups));
  }, [expandedNavGroups]);

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

  const toggleNavGroup = (id: NavGroupId, keepOthers: boolean) => {
    setExpandedNavGroups((current) => {
      if (current.includes(id)) return current.filter((groupId) => groupId !== id);
      return keepOthers ? [...current, id] : [id];
    });
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
      <aside
        className={`hidden flex-col border-r border-border bg-card shrink-0 sticky top-0 h-screen overflow-hidden transition-[width] duration-200 ${
          sidebarCollapsed ? "md:flex w-0 border-r-0" : "md:flex w-64"
        }`}
      >
        <div className="flex h-full w-64 shrink-0 flex-col">
          <div className="flex h-16 items-center border-b border-border px-6">
            <Link to="/" className="flex items-center shrink-0">
              <img
                src={brandLogo}
                alt="Admark Digitals Logo"
                className="h-10 w-auto max-h-10 object-contain"
              />
            </Link>
          </div>

          <SidebarNavigation
            path={path}
            expandedGroups={expandedNavGroups}
            onToggleGroup={toggleNavGroup}
            showValuation={company.companyValuationEnabled === true}
          />
        </div>
      </aside>

      {/* Right Area */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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

          <div className="hidden md:flex items-center gap-3">
            <button
              type="button"
              onClick={toggleSidebar}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={sidebarCollapsed ? "Open sidebar" : "Close sidebar"}
              title={sidebarCollapsed ? "Open sidebar" : "Close sidebar"}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="h-5 w-5" />
              ) : (
                <PanelLeftClose className="h-5 w-5" />
              )}
            </button>
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest bg-muted/60 px-2.5 py-1 rounded">
              Admark Operating System
            </span>
          </div>

          {/* Right Area */}
          <div className="flex items-center gap-3">
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
                <SheetContent
                  side="left"
                  className="flex w-full max-w-[min(100vw,20rem)] flex-col sm:max-w-sm"
                >
                  <SheetTitle className="text-left font-bold text-foreground border-b border-border pb-3 flex items-center gap-2">
                    Navigation Menu
                  </SheetTitle>
                  <SidebarNavigation
                    path={path}
                    expandedGroups={expandedNavGroups}
                    onToggleGroup={toggleNavGroup}
                    showValuation={company.companyValuationEnabled === true}
                    onNavigate={() => setMobileMenuOpen(false)}
                  />
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
              <code className="rounded bg-amber-500/15 px-1 font-mono text-amber-50">
                SUPABASE_URL
              </code>{" "}
              and{" "}
              <code className="rounded bg-amber-500/15 px-1 font-mono text-amber-50">
                SUPABASE_SERVICE_ROLE_KEY
              </code>{" "}
              in <code className="rounded bg-amber-500/15 px-1 font-mono text-amber-50">.env</code>.
            </span>
          </div>
        )}

        {/* Main Outlet */}
        <main
          className={
            path === "/settings"
              ? "flex min-h-0 flex-1 flex-col overflow-hidden"
              : "flex-1 overflow-y-auto px-6 py-8"
          }
        >
          <div
            className={
              path === "/settings" ? "flex h-full min-h-0 flex-1 flex-col" : "mx-auto max-w-6xl"
            }
          >
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
