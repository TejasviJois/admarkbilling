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
  Bell,
  Shield,
  Moon,
  Sun,
  LayoutDashboard,
  Users,
  BriefcaseBusiness,
  WalletCards,
  BarChart3,
  Settings,
  ChevronRight,
  Circle,
} from "lucide-react";

import appCss from "../styles.css?url";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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
      {
        name: "description",
        content: "Internal operations, billing & invoice automation for Admark.",
      },
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
  const base =
    "flex w-full items-center justify-start gap-2.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200";
  const tone = active
    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
    : "text-muted-foreground hover:bg-muted hover:text-foreground";
  return `${base} ${tone}`;
};

type NavLinkItem = { to: string; label: string; exact?: boolean };
type NavGroupId = "crm" | "operations" | "finance" | "insights" | "administration";
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
      { to: "/clients", label: "Clients" },
      { to: "/leads", label: "Leads" },
      { to: "/partnerships", label: "Partnerships" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    icon: BriefcaseBusiness,
    section: "Daily Work",
    items: [
      { to: "/projects", label: "Projects" },
      { to: "/calendar", label: "Calendar" },
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
      { to: "/invoices", label: "Invoices" },
      { to: "/founders", label: "Founders" },
    ],
  },
  {
    id: "insights",
    label: "Insights",
    icon: BarChart3,
    section: "Business Intelligence",
    items: [
      { to: "/analytics", label: "Analytics" },
      { to: "/valuation", label: "Company Valuation" },
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
  onNavigate,
}: {
  path: string;
  expandedGroups: NavGroupId[];
  onToggleGroup: (id: NavGroupId, keepOthers: boolean) => void;
  onNavigate?: () => void;
}) {
  const isActive = (to: string, exact?: boolean) =>
    exact ? path === to : path === to || path.startsWith(`${to}/`);

  const renderGroup = (group: NavGroup) => {
    const expanded = expandedGroups.includes(group.id);
    const active = group.items.some((item) => isActive(item.to, item.exact));
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
              {group.items.map(({ to, label, exact }) => {
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
        {NAV_GROUPS.filter((group) => group.section === "Business Intelligence").map(renderGroup)}
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
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [reminderClock, setReminderClock] = useState(() => Date.now());
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [expandedNavGroups, setExpandedNavGroups] = useState<NavGroupId[]>([]);

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

  useEffect(() => {
    const timer = window.setInterval(() => setReminderClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem("admark.theme");
    const nextTheme = saved === "light" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.classList.toggle("light", nextTheme === "light");
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
  }, []);

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
    window.localStorage.setItem(NAV_EXPANSION_STORAGE_KEY, JSON.stringify(expandedNavGroups));
  }, [expandedNavGroups]);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    window.localStorage.setItem("admark.theme", nextTheme);
    document.documentElement.classList.toggle("light", nextTheme === "light");
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
  };

  // Central Notification Sync
  useEffect(() => {
    if (!ops || !invoices || !docs || serverDb === null) return;

    const synced = syncSystemNotifications(ops, invoices, docs.agreements ?? [], serverDb);
    const originalIds = (ops.notifications ?? []).map((n) => `${n.id}-${n.read}`).join(",");
    const syncedIds = synced.map((n) => `${n.id}-${n.read}`).join(",");

    if (originalIds !== syncedIds) {
      persist({ ...ops, notifications: synced });
    }
  }, [ops, invoices, docs, serverDb, persist, reminderClock]);

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

        <SidebarNavigation
          path={path}
          expandedGroups={expandedNavGroups}
          onToggleGroup={toggleNavGroup}
        />
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
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>

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
              <SheetContent
                side="right"
                className="flex w-full max-w-[min(100vw,24rem)] flex-col sm:max-w-md"
              >
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
                          <span
                            className={`h-1.5 w-1.5 rounded-full shrink-0 mt-1.5 ${item.read ? "bg-transparent" : "bg-primary animate-pulse"}`}
                          />
                        </div>
                        <p className="text-muted-foreground mt-1 leading-normal">{item.message}</p>
                        <div className="mt-2.5 flex items-center justify-between">
                          <span className="text-[9px] text-muted-foreground font-semibold tabular-nums">
                            {item.timestamp}
                          </span>
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
                    to="/logs"
                    onClick={() => setNotificationsOpen(false)}
                    className="block w-full text-center text-xs font-bold bg-muted hover:bg-muted/80 text-foreground py-2.5 rounded-lg transition-colors"
                  >
                    View Activity Logs
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
        <main className="flex-1 overflow-y-auto px-6 py-8">
          <div className="max-w-6xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
