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
import { getAuthStatusCached, clearAuthStatusCache, peekAuthStatusCache } from "@/lib/auth-status-cache";
import { prefetchAppData } from "@/lib/prefetch-app-data";
import { useCompany } from "@/hooks/use-company";
import { isServerApiConfigured } from "@/lib/backend-status-cache";
import { logoutFn, type PortalRole } from "@/server/auth-fns";
import { safeLocalStorageSet } from "@/lib/browser-storage";
import { LoadingDog } from "@/components/ui/loading-dog";
import { useOperations } from "@/hooks/use-operations";
import { useMeetingNotifications } from "@/lib/meeting-notifications";

function NotFoundComponent() {
  const router = useRouter();

  // Stale bookmarks / phone home-screen URLs land on paths that no longer
  // exist — bounce to the role home instead of a dead-end 404.
  useEffect(() => {
    void getAuthStatusCached()
      .then((status) => {
        void router.navigate({
          to: status.role === "sales" ? "/lead-list" : "/",
          replace: true,
        });
      })
      .catch(() => {
        void router.navigate({ to: "/", replace: true });
      });
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This page doesn't exist — redirecting…
        </p>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  const err = error instanceof Error ? error : new Error(String(error));
  logClientError("route-error-boundary", err);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{err.message}</p>
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
    const status = await getAuthStatusCached();
    if (!status.ok) {
      throw redirect({
        to: "/login",
        search: { redirect: location.pathname || "/" },
      });
    }
    if (status.role === "sales") {
      const path = location.pathname || "/";
      const allowed =
        path === "/lead-list" ||
        path.startsWith("/lead-list/") ||
        path === "/contacted" ||
        path.startsWith("/contacted/") ||
        path === "/my-wins" ||
        path.startsWith("/my-wins/") ||
        path === "/directory" ||
        path.startsWith("/directory/");
      if (!allowed) {
        throw redirect({ to: "/lead-list" });
      }
      return;
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
        rel: "preload",
        as: "style",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap",
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
        <script
          dangerouslySetInnerHTML={{
            __html: `var l=document.createElement('link');l.rel='stylesheet';l.href='https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap';document.head.appendChild(l);`,
          }}
        />
        <noscript>
          <link
            rel="stylesheet"
            href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"
          />
        </noscript>
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
    "flex w-full items-center justify-start gap-2.5 rounded-xl px-4 py-2.5 text-sm transition-all duration-300";
  const tone = active
    ? "bg-gradient-to-r from-[#ff6b2b] to-[#f04400] text-white shadow-lg shadow-orange-500/30 font-bold"
    : "text-white/75 hover:bg-white/[0.06] hover:text-white font-medium";
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
      { to: "/lead-list", label: "Lead List" },
      { to: "/directory", label: "Directory" },
      { to: "/contacted", label: "Contacted" },
      { to: "/clients", label: "Clients" },
      { to: "/leads", label: "Pipeline" },
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
      { to: "/credentials", label: "Credentials" },
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
  showPartnerships,
  salesOnly,
  onNavigate,
}: {
  path: string;
  expandedGroups: NavGroupId[];
  onToggleGroup: (id: NavGroupId, keepOthers: boolean) => void;
  showValuation: boolean;
  showPartnerships: boolean;
  salesOnly?: boolean;
  onNavigate?: () => void;
}) {
  const isActive = (to: string, exact?: boolean) =>
    exact ? path === to : path === to || path.startsWith(`${to}/`);

  if (salesOnly) {
    return (
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4" aria-label="Primary navigation">
        <div className="space-y-1">
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Sales
          </p>
          <Link
            to="/lead-list"
            preload="intent"
            onClick={onNavigate}
            className={navLinkClass(isActive("/lead-list"))}
          >
            Lead List
          </Link>
          <Link
            to="/directory"
            preload="intent"
            onClick={onNavigate}
            className={navLinkClass(isActive("/directory"))}
          >
            Directory
          </Link>
          <Link
            to="/contacted"
            preload="intent"
            onClick={onNavigate}
            className={navLinkClass(isActive("/contacted"))}
          >
            Contacted
          </Link>
          <Link
            to="/my-wins"
            preload="intent"
            onClick={onNavigate}
            className={navLinkClass(isActive("/my-wins"))}
          >
            My wins
          </Link>
        </div>
      </nav>
    );
  }

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
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40 ${
            active
              ? "border border-orange-500/25 bg-orange-500/15 text-orange-400 shadow-inner"
              : "text-white/60 hover:bg-white/[0.06] hover:text-white"
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
            <div className="ml-5 space-y-0.5 border-l border-white/10 pb-1 pl-3 pt-0.5">
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
                    className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] transition-all ${
                      childActive
                        ? "bg-gradient-to-r from-orange-500 to-amber-600 font-bold text-white shadow-md shadow-orange-500/20"
                        : "font-medium text-white/60 hover:bg-white/[0.06] hover:text-white"
                    }`}
                  >
                    <Circle
                      className={`h-1.5 w-1.5 shrink-0 ${
                        childActive ? "fill-current" : "fill-white/30"
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
      <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-orange-400/80">
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

      <p className="mb-2 mt-6 border-t border-white/10 px-3 pt-5 text-[10px] font-bold uppercase tracking-[0.16em] text-orange-400/80">
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
      </div>

      <p className="mb-2 mt-6 border-t border-white/10 px-3 pt-5 text-[10px] font-bold uppercase tracking-[0.16em] text-orange-400/80">
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
  // null until auth resolves — avoids flashing the admin nav for sales users
  const [portalRole, setPortalRole] = useState<PortalRole | null>(() => {
    const peek = peekAuthStatusCache();
    if (!peek?.ok) return null;
    return peek.role === "sales" ? "sales" : "admin";
  });

  const { company } = useCompany();
  const { ops } = useOperations();
  useMeetingNotifications(ops?.scheduleEvents);

  const brandLogo = companyLogoSrc(company);
  const isLogin = path === "/login";
  const salesOnly = portalRole === "sales";
  const homePath = salesOnly ? "/lead-list" : "/";

  useEffect(() => {
    let cancelled = false;
    void getAuthStatusCached()
      .then((status) => {
        if (cancelled) return;
        if (!status.ok) {
          setPortalRole(null);
          return;
        }
        setPortalRole(status.role === "sales" ? "sales" : "admin");
      })
      .catch(() => {
        if (!cancelled) setPortalRole(null);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

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

  if (portalRole === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <LoadingDog message="Loading…" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen bg-[#0e0e14] text-foreground selection:bg-orange-500/30 selection:text-orange-200">
      {/* Dynamic Ambient Gradient Meshes (Powers frosted glassmorphism across all pages) */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
        {/* Top Right Amber/Orange aura */}
        <div className="absolute -right-32 -top-40 h-[650px] w-[650px] rounded-full bg-gradient-to-br from-[#ff6b2b]/15 via-[#f04400]/05 to-transparent blur-[140px]" />
        {/* Mid Left Violet/Indigo aura */}
        <div className="absolute -left-32 top-1/3 h-[600px] w-[600px] rounded-full bg-gradient-to-tr from-indigo-600/10 via-purple-600/05 to-transparent blur-[150px]" />
        {/* Bottom Right Emerald/Teal aura */}
        <div className="absolute -bottom-32 right-1/4 h-[550px] w-[550px] rounded-full bg-gradient-to-tl from-emerald-500/08 via-teal-500/04 to-transparent blur-[140px]" />
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:28px_28px] opacity-60" />
      </div>

      {/* Desktop Sidebar */}
      <aside
        className={`hidden flex-col border-r border-white/[0.08] bg-[#121217]/75 backdrop-blur-2xl shrink-0 sticky top-0 h-screen overflow-hidden transition-[width] duration-300 z-20 shadow-[10px_0_30px_-10px_rgba(0,0,0,0.5)] ${
          sidebarCollapsed ? "md:flex w-0 border-r-0" : "md:flex w-64"
        }`}
      >
        <div className="flex h-full w-64 shrink-0 flex-col">
          <div className="flex h-16 items-center border-b border-white/[0.08] px-6">
            <Link to={homePath} aria-label="Admark Home" className="flex items-center shrink-0">
              <img
                src={brandLogo}
                alt="Admark Logo"
                width={157}
                height={32}
                fetchPriority="high"
                decoding="async"
                className="h-8 w-auto max-h-9 object-contain drop-shadow-[0_2px_12px_rgba(255,107,43,0.35)]"
              />
            </Link>
          </div>

          <SidebarNavigation
            path={path}
            expandedGroups={expandedNavGroups}
            onToggleGroup={toggleNavGroup}
            showValuation={company.companyValuationEnabled === true}
            showPartnerships={company.partnershipsEnabled === true}
            salesOnly={salesOnly}
          />
        </div>
      </aside>

      {/* Right Area */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Header Bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-white/[0.08] bg-[#121217]/70 px-4 backdrop-blur-2xl supports-[backdrop-filter]:bg-[#121217]/60 sm:h-16 sm:px-6">
          {/* Left: Mobile branding */}
          <div className="flex items-center gap-3 md:hidden">
            <Link to={homePath} aria-label="Admark Home" className="flex items-center shrink-0">
              <img
                src={brandLogo}
                alt="Admark Logo"
                width={137}
                height={28}
                fetchPriority="high"
                decoding="async"
                className="h-7 w-auto object-contain drop-shadow-[0_2px_10px_rgba(255,107,43,0.3)]"
              />
            </Link>
          </div>

          <div className="hidden md:flex items-center gap-3">
            <button
              type="button"
              onClick={toggleSidebar}
              className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/70 transition-colors hover:border-orange-500/30 hover:bg-white/10 hover:text-white"
              aria-label={sidebarCollapsed ? "Open sidebar" : "Close sidebar"}
              title={sidebarCollapsed ? "Open sidebar" : "Close sidebar"}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="h-5 w-5" />
              ) : (
                <PanelLeftClose className="h-5 w-5" />
              )}
            </button>
            <span className="text-[11px] font-bold text-orange-400 uppercase tracking-widest bg-orange-500/10 border border-orange-500/20 px-3 py-1 rounded-full shadow-inner">
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
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white shadow-sm transition-colors hover:bg-white/10"
                    aria-expanded={mobileMenuOpen}
                    aria-label="Open sidebar menu"
                  >
                    <Menu className="h-5 w-5" strokeWidth={2} />
                  </button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="flex w-full max-w-[min(100vw,20rem)] flex-col border-r border-white/10 bg-[#141419]/95 text-white backdrop-blur-3xl sm:max-w-sm"
                >
                  <SheetTitle className="text-left font-bold text-white border-b border-white/10 pb-3 flex items-center gap-2">
                    Navigation Menu
                  </SheetTitle>
                  <SidebarNavigation
                    path={path}
                    expandedGroups={expandedNavGroups}
                    onToggleGroup={toggleNavGroup}
                    showValuation={company.companyValuationEnabled === true}
                    showPartnerships={company.partnershipsEnabled === true}
                    salesOnly={salesOnly}
                    onNavigate={() => setMobileMenuOpen(false)}
                  />
                  <div className="border-t border-white/10 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        handleSignOut();
                      }}
                      className="inline-flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-rose-400 hover:bg-rose-500/10 transition-colors"
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
              className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-400 text-white transition-all duration-200"
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
              : "flex-1 overflow-y-auto px-2.5 py-3 sm:px-6 sm:py-8"
          }
        >
          <div
            className={
              path === "/settings"
                ? "flex h-full min-h-0 flex-1 flex-col"
                : path === "/"
                  ? "mx-auto w-full min-w-0 max-w-[1720px]"
                  : "mx-auto w-full min-w-0 max-w-6xl"
            }
          >
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
