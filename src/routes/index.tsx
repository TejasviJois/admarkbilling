import { useEffect, useMemo, useState, useRef, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  IndianRupee,
  TrendingUp,
  TrendingDown,
  Activity,
  Briefcase,
  CalendarDays,
  Clock3,
  Phone,
  BellRing,
  Search,
  ArrowUpRight,
  FileText,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Sliders,
  LayoutDashboard,
  WalletCards,
  Users,
  Settings,
  MoreVertical,
  CheckCircle2,
  ArrowRight,
  Plus,
  X,
  ExternalLink,
  ShieldCheck,
  Check,
  Zap,
  Layers,
} from "lucide-react";
import { useOperations } from "@/hooks/use-operations";
import { computeFinancialSummary } from "@/lib/financial";
import { formatINRWhole } from "@/lib/invoice-calc";
import { sumActiveMrr } from "@/lib/project-billing";
import { estimatedPending, paymentSummary } from "@/lib/project-payments";
import { isRevenueProject } from "@/lib/project-status";
import {
  formatScheduleDateTime,
  isUpcomingScheduleEvent,
  scheduleReminderState,
  sortScheduleEvents,
} from "@/lib/schedule";
import { peekAuthStatusCache, getAuthStatusCached } from "@/lib/auth-status-cache";
import { Button } from "@/components/ui/button";
import { ReminderFormDialog } from "@/components/operations/ReminderFormDialog";
import {
  getSystemNotificationStatus,
  notifyScheduledEventCreated,
  requestSystemNotificationPermission,
  useMeetingNotifications,
} from "@/lib/meeting-notifications";
import { toast } from "sonner";
import type { ScheduleEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({ component: ExecutiveDashboardV7 });

type ActivityTimeframe = "weekly" | "monthly";
type DashboardViewTab = "executive" | "ops_ledger";

function ExecutiveDashboardV7() {
  const navigate = useNavigate();
  const { ops, persist, loading: opsLoading } = useOperations();
  const [hasRendered, setHasRendered] = useState(false);
  const [reminderClock, setReminderClock] = useState(() => Date.now());
  const [activeTab, setActiveTab] = useState<DashboardViewTab>("executive");
  const [activityTimeframe, setActivityTimeframe] = useState<ActivityTimeframe>("weekly");
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Notification state
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState<
    "all" | "meetings" | "calls" | "reminders"
  >("all");
  const [notificationPerm, setNotificationPerm] = useState<string>(() =>
    getSystemNotificationStatus(),
  );
  const notificationRef = useRef<HTMLDivElement>(null);

  const handleEnableNotifications = async () => {
    const granted = await requestSystemNotificationPermission();
    setNotificationPerm(granted ? "granted" : "denied");
  };

  // System & desktop meeting notifications
  useMeetingNotifications(ops?.scheduleEvents);

  // Schedule Event Dialog state
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleDialogDate, setScheduleDialogDate] = useState("");
  const [scheduleDialogType, setScheduleDialogType] = useState<ScheduleEvent["type"]>("meeting");

  const openScheduleForDate = (day: number | null, type: ScheduleEvent["type"] = "meeting") => {
    const y = calendarDate.getFullYear();
    const m = String(calendarDate.getMonth() + 1).padStart(2, "0");
    const d = String(day || new Date().getDate()).padStart(2, "0");
    setScheduleDialogDate(`${y}-${m}-${d}`);
    setScheduleDialogType(type);
    setScheduleDialogOpen(true);
  };

  const handleSaveScheduleEvent = (saved: ScheduleEvent) => {
    const existing = ops?.scheduleEvents ?? [];
    persist({
      ...ops,
      scheduleEvents: [...existing, saved],
    });
    notifyScheduledEventCreated(saved);
    toast.success(
      `${saved.type === "meeting" ? "Meeting" : saved.type === "call" ? "Call" : "Reminder"} scheduled successfully!`,
    );
  };

  // User display name from auth
  const [displayName, setDisplayName] = useState<string>(() => {
    const peek = peekAuthStatusCache();
    return peek?.displayName || peek?.username || "Admin";
  });

  useEffect(() => {
    void getAuthStatusCached().then((status) => {
      if (status.ok) {
        setDisplayName(status.displayName || status.username || "Admin");
      }
    });
  }, []);

  // Calendar interactive state
  const [calendarDate, setCalendarDate] = useState(() => new Date());
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<number | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setReminderClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!opsLoading) setHasRendered(true);
  }, [opsLoading]);

  // Click outside listener for search and notifications
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(e.target as Node)) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Greeting based on current hour
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  }, []);

  // Dynamic calculations
  const dashboardData = useMemo(() => {
    if (!ops) return null;

    const transactions = (ops.transactions ?? []).filter((t) => !t.historical);
    const projects = ops.projects ?? [];
    const financial = computeFinancialSummary(ops);
    const cashBalance = financial.currentCashBalance;
    const revenue = financial.totalRevenueReceived;
    const expenses = financial.totalExpense;
    const revenueBooked = financial.totalRevenueBooked;

    const outstandingReceivables = projects
      .filter((project) => isRevenueProject(project.status))
      .reduce((sum, project) => sum + estimatedPending(project), 0);

    const activeMrr = sumActiveMrr(projects);

    const recentPayments = transactions
      .filter((t) => t.type === "client_payment")
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 6);

    // Monthly chart data (last 5 months for smooth spline)
    const monthKeys = Array.from({ length: 5 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (4 - i));
      return d.toISOString().slice(0, 7);
    });

    const monthlyChartData = monthKeys.map((mKey) => {
      const monthPayments = transactions.filter(
        (t) => t.type === "client_payment" && t.date.startsWith(mKey),
      );
      const rev = monthPayments.reduce((s, t) => s + t.amount, 0);
      const parts = mKey.split("-");
      const label = new Date(Number(parts[0]), Number(parts[1]) - 1).toLocaleString("default", {
        month: "short",
      });
      return { label, revenue: rev };
    });

    // Weekly inflow data based on actual transactions
    const now = new Date();
    const weeklyChartData = Array.from({ length: 5 }, (_, i) => {
      const weekIndex = 4 - i;
      const endDaysAgo = weekIndex * 7;
      const startDaysAgo = (weekIndex + 1) * 7;
      const endD = new Date(now.getTime() - endDaysAgo * 86400000);
      const startD = new Date(now.getTime() - startDaysAgo * 86400000);
      const startIso = startD.toISOString().slice(0, 10);
      const endIso = endD.toISOString().slice(0, 10);

      const weekInflow = transactions
        .filter((t) => t.type === "client_payment" && t.date >= startIso && t.date <= endIso)
        .reduce((s, t) => s + t.amount, 0);

      return {
        label: i === 4 ? "This Wk" : `W-${4 - i}`,
        revenue: weekInflow,
      };
    });

    // Top active project for spotlight card
    const spotlightProject =
      projects.find((p) => isRevenueProject(p.status) && (p.billing?.monthlyAmount ?? 0) > 0) ||
      projects.find((p) => isRevenueProject(p.status)) ||
      projects[0] ||
      null;

    return {
      cashBalance,
      revenue,
      expenses,
      revenueBooked,
      outstandingReceivables,
      activeMrr,
      recentPayments,
      monthlyChartData,
      weeklyChartData,
      spotlightProject,
      activeRetainersCount: projects.filter(
        (p) => isRevenueProject(p.status) && (p.billing?.monthlyAmount ?? 0) > 0,
      ).length,
      activeProjectsCount: projects.filter((p) => isRevenueProject(p.status)).length,
      totalClientsCount: ops.clients?.length || new Set(projects.map((p) => p.client)).size || 0,
    };
  }, [ops]);

  // Upcoming schedule events
  const upcomingSchedule = useMemo(() => {
    const now = new Date(reminderClock);
    return sortScheduleEvents(
      (ops.scheduleEvents ?? []).filter((event) => isUpcomingScheduleEvent(event, now)),
    );
  }, [ops.scheduleEvents, reminderClock]);

  // Upcoming project milestones
  const upcomingMilestones = useMemo(() => {
    const list: Array<{
      id: string;
      title: string;
      dueDate: string;
      projectName: string;
      client: string;
    }> = [];
    const todayStr = new Date().toISOString().slice(0, 10);
    (ops.projects ?? []).forEach((proj) => {
      (proj.milestones ?? []).forEach((m) => {
        if (
          m.dueDate &&
          m.dueDate >= todayStr &&
          (m.status === "pending" || m.status === "in_progress")
        ) {
          list.push({
            id: `milestone-${m.id}`,
            title: m.name || "Project Milestone",
            dueDate: m.dueDate,
            projectName: proj.name || proj.client,
            client: proj.client,
          });
        }
      });
    });
    return list.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [ops.projects]);

  const totalFutureAlertsCount = upcomingSchedule.length + upcomingMilestones.length;

  const filteredNotifications = useMemo(() => {
    if (notificationFilter === "meetings") {
      return upcomingSchedule.filter((e) => e.type === "meeting");
    }
    if (notificationFilter === "calls") {
      return upcomingSchedule.filter((e) => e.type === "call");
    }
    if (notificationFilter === "reminders") {
      return upcomingSchedule.filter((e) => e.type === "reminder");
    }
    return upcomingSchedule;
  }, [upcomingSchedule, notificationFilter]);

  // Spotlight project operational insights
  const spotlightDetails = useMemo(() => {
    const proj = dashboardData?.spotlightProject;
    if (!proj) return null;
    const summary = paymentSummary(proj);
    const target =
      summary.target ??
      proj.budget ??
      (proj.billing?.contractValue ||
        (proj.billing?.monthlyAmount ? proj.billing.monthlyAmount * 12 : 0) ||
        50000);
    const received = summary.received;
    const pending = summary.pending ?? (target > received ? target - received : 0);
    const recoveryPct =
      target > 0 ? Math.min(100, Math.max(0, Math.round((received / target) * 100))) : 100;

    const nextMilestone =
      proj.milestones?.find((m) => m.status === "pending" || m.status === "in_progress") || null;

    return {
      target,
      received,
      pending,
      recoveryPct,
      nextMilestone,
    };
  }, [dashboardData?.spotlightProject]);

  // Calendar days and event dots calculation
  const calendarData = useMemo(() => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
    const currentDay = isCurrentMonth ? today.getDate() : -1;

    // Map events in this month
    const monthString = `${year}-${String(month + 1).padStart(2, "0")}`;
    const eventsByDay = new Map<number, { type: string; title: string; due: boolean }[]>();

    for (const ev of ops.scheduleEvents ?? []) {
      const evDate = ev.date || "";
      if (evDate.startsWith(monthString)) {
        const day = parseInt(evDate.slice(8, 10), 10);
        if (!eventsByDay.has(day)) eventsByDay.set(day, []);
        eventsByDay.get(day)!.push({
          type: ev.type,
          title: ev.title,
          due: scheduleReminderState(ev, new Date(reminderClock)) === "due",
        });
      }
    }

    const days: Array<{
      day: number;
      isToday: boolean;
      events: { type: string; title: string; due: boolean }[];
    }> = [];

    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        day: i,
        isToday: i === currentDay,
        events: eventsByDay.get(i) || [],
      });
    }

    return {
      monthLabel: calendarDate.toLocaleString("default", { month: "long", year: "numeric" }),
      firstDayIndex,
      days,
    };
  }, [calendarDate, ops.scheduleEvents, reminderClock]);

  // Filtered schedule list based on selected calendar date
  const displayedSchedule = useMemo(() => {
    if (!selectedCalendarDay) {
      return upcomingSchedule.slice(0, 4);
    }
    const year = calendarDate.getFullYear();
    const month = String(calendarDate.getMonth() + 1).padStart(2, "0");
    const day = String(selectedCalendarDay).padStart(2, "0");
    const targetDateStr = `${year}-${month}-${day}`;

    const filtered = (ops.scheduleEvents ?? []).filter((ev) => {
      const evDate = ev.date || "";
      return evDate === targetDateStr;
    });
    return filtered.length > 0 ? filtered : upcomingSchedule.slice(0, 4);
  }, [selectedCalendarDay, calendarDate, ops.scheduleEvents, upcomingSchedule]);

  // Live search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim() || !ops) return [];
    const q = searchQuery.toLowerCase();
    const results: Array<{ id: string; title: string; type: string; href: string }> = [];

    // Search Projects
    for (const p of ops.projects ?? []) {
      const pName = p.client || p.name || "Project";
      if (pName.toLowerCase().includes(q)) {
        results.push({
          id: `proj-${p.id}`,
          title: pName,
          type: "Project",
          href: `/projects/${p.id}`,
        });
      }
    }
    // Search Clients
    for (const c of ops.clients ?? []) {
      const cName = c.companyName || c.contactPerson || "Client";
      if (cName.toLowerCase().includes(q)) {
        results.push({
          id: `client-${c.id}`,
          title: cName,
          type: "Client",
          href: `/clients/${c.id}`,
        });
      }
    }
    // Search Leads
    for (const l of ops.leads ?? []) {
      const lName = l.company || l.contactPerson || "Lead";
      if (lName.toLowerCase().includes(q)) {
        results.push({
          id: `lead-${l.id}`,
          title: lName,
          type: "Lead",
          href: `/leads`,
        });
      }
    }
    return results.slice(0, 6);
  }, [searchQuery, ops]);

  if ((opsLoading || !dashboardData) && !hasRendered) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <Activity className="h-6 w-6 animate-spin text-orange-500" />
        <span className="font-medium tracking-wide">Loading Executive Dashboard…</span>
      </div>
    );
  }

  if (!dashboardData) return null;

  // Active chart points based on selected timeframe
  const chartPoints =
    activityTimeframe === "weekly"
      ? dashboardData.weeklyChartData
      : dashboardData.monthlyChartData;

  const maxVal = Math.max(...chartPoints.map((p) => p.revenue), 100000);
  const chartWidth = 520;
  const chartHeight = 130;
  const paddingX = 30;
  const paddingY = 20;

  // Compute spline points
  const points = chartPoints.map((pt, i) => {
    const x = paddingX + (i / (chartPoints.length - 1)) * (chartWidth - paddingX * 2);
    const normalizedY = (pt.revenue / maxVal) * (chartHeight - paddingY * 2);
    const y = chartHeight - paddingY - normalizedY;
    return { x, y, label: pt.label, value: pt.revenue };
  });

  // SVG curved path builder
  let pathD = "";
  if (points.length > 0) {
    pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cx = (p0.x + p1.x) / 2;
      pathD += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
    }
  }

  const areaD = `${pathD} L ${points[points.length - 1]?.x || 0} ${chartHeight} L ${
    points[0]?.x || 0
  } ${chartHeight} Z`;

  const activePoint =
    hoveredPointIndex !== null && points[hoveredPointIndex]
      ? points[hoveredPointIndex]
      : points[points.length - 2] || points[points.length - 1];

  return (
    <div className="relative mx-auto flex w-full max-w-[1680px] flex-col gap-6 pb-20 pt-2 text-foreground lg:gap-8">
      {/* Top Floating Glass Workspace Flex Container */}
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">

        {/* ========================================================================= */}
        {/* CENTER MAIN GLASS CANVAS (The hero card in the reference image) */}
        {/* ========================================================================= */}
        <main className="flex-1 space-y-4 sm:space-y-6 rounded-2xl sm:rounded-[36px] border border-white/[0.08] bg-[#141419]/85 p-3.5 sm:p-6 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] backdrop-blur-3xl lg:p-8">
          {/* Canvas Top Bar: Clean, spacious Header & Action Controls */}
          <div className="flex flex-col gap-3.5 sm:gap-5 border-b border-white/[0.08] pb-4 sm:pb-6">
            {/* Row 1: Greeting + Bell placed side-by-side cleanly on BOTH mobile and desktop */}
            <div className="flex items-start justify-between gap-3">
              {/* Greeting */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl lg:text-3xl">
                    {greeting}, {displayName}
                  </h1>
                  <span className="text-xl sm:text-2xl select-none" role="img" aria-label="Waving hand">👋</span>
                </div>
                <p className="mt-1 text-xs text-white/70 sm:text-sm">
                  Here's what is happening with Admark billing, revenue &amp; operations today.
                </p>
              </div>

              {/* Notification Bell in Top Right Corner */}
              <div ref={notificationRef} className="relative shrink-0 pt-0.5">
                <button
                  type="button"
                  onClick={() => setNotificationsOpen((v) => !v)}
                  aria-label="View scheduled notifications"
                  className={cn(
                    "relative flex h-10 w-10 sm:h-9 sm:w-9 items-center justify-center rounded-2xl sm:rounded-full border transition-all cursor-pointer backdrop-blur-md",
                    notificationsOpen
                      ? "border-orange-500/60 bg-orange-500/20 text-orange-400 shadow-[0_0_15px_rgba(255,107,43,0.3)]"
                      : "border-white/10 bg-white/[0.04] text-white/70 hover:border-white/20 hover:bg-white/10 hover:text-white",
                  )}
                >
                  <BellRing className="h-4.5 w-4.5 sm:h-4 sm:w-4" />
                  {totalFutureAlertsCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-gradient-to-r from-rose-500 to-orange-500 px-1 text-[9px] font-black text-white shadow-[0_0_10px_rgba(244,63,94,0.7)] animate-pulse">
                      {totalFutureAlertsCount}
                    </span>
                  )}
                </button>

                {/* Notifications Popup */}
                {notificationsOpen && (
                  <>
                    {/* Mobile backdrop */}
                    <div
                      className="fixed inset-0 z-[140] bg-black/60 backdrop-blur-xs sm:hidden"
                      onClick={() => setNotificationsOpen(false)}
                    />

                    <div className="fixed inset-x-3 top-20 sm:absolute sm:inset-auto sm:right-0 sm:top-12 z-[150] w-auto sm:w-[410px] rounded-3xl border border-white/15 bg-[#16161e]/98 p-4 shadow-2xl shadow-black/80 backdrop-blur-3xl text-left animate-in fade-in zoom-in-95 duration-200">
                      <div className="flex items-center justify-between border-b border-white/10 pb-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500/15 text-orange-400">
                            <BellRing className="h-4 w-4" />
                          </div>
                          <div>
                            <h2 className="text-xs font-bold text-white tracking-wide">
                              Scheduled Alerts &amp; Notifications
                            </h2>
                            <p className="text-[10px] text-white/70">
                              {totalFutureAlertsCount} future scheduled item{totalFutureAlertsCount === 1 ? "" : "s"}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setNotificationsOpen(false);
                              openScheduleForDate(null, "meeting");
                            }}
                            className="flex items-center gap-1 rounded-lg border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-[10px] font-bold text-orange-400 hover:bg-orange-500/20 transition-all cursor-pointer"
                          >
                            <Plus className="h-3 w-3" />
                            <span>Schedule</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setNotificationsOpen(false)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors cursor-pointer sm:hidden"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* System Alerts Status Banner */}
                      {notificationPerm !== "granted" ? (
                        <div className="mt-3 flex items-center justify-between gap-2.5 rounded-xl border border-orange-500/25 bg-orange-500/10 p-2.5">
                          <div className="flex items-start gap-2 min-w-0">
                            <Sparkles className="mt-0.5 h-3.5 w-3.5 text-orange-400 shrink-0" />
                            <p className="text-[11px] text-white/80 leading-snug">
                              Enable browser alerts to receive system notifications on desktop and phone.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleEnableNotifications}
                            className="shrink-0 rounded-lg bg-orange-500 px-2.5 py-1 text-[10px] font-black text-white hover:bg-orange-600 transition-all cursor-pointer shadow-sm shadow-orange-500/40"
                          >
                            Enable
                          </button>
                        </div>
                      ) : (
                        <div className="mt-2.5 flex items-center gap-1.5 text-[10px] font-semibold text-emerald-400/90 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
                          <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                          <span>System alerts are enabled for this device</span>
                        </div>
                      )}

                      {/* Category Filter Tabs */}
                      <div className="mt-3 flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar">
                        {(
                          [
                            { id: "all", label: `All (${totalFutureAlertsCount})` },
                            {
                              id: "meetings",
                              label: `Meetings (${upcomingSchedule.filter((e) => e.type === "meeting").length})`,
                            },
                            {
                              id: "calls",
                              label: `Calls (${upcomingSchedule.filter((e) => e.type === "call").length})`,
                            },
                            {
                              id: "reminders",
                              label: `Reminders (${upcomingSchedule.filter((e) => e.type === "reminder").length})`,
                            },
                          ] as const
                        ).map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setNotificationFilter(tab.id)}
                            className={cn(
                              "whitespace-nowrap rounded-lg px-2.5 py-1 text-[10px] font-bold transition-all cursor-pointer",
                              notificationFilter === tab.id
                                ? "bg-white/15 text-white shadow-xs"
                                : "bg-white/[0.03] text-white/50 hover:text-white/80 hover:bg-white/[0.06]",
                            )}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      {/* Scheduled Events List */}
                      <div className="mt-2.5 max-h-72 overflow-y-auto space-y-2 pr-0.5">
                        {filteredNotifications.length === 0 ? (
                          <div className="py-6 text-center">
                            <Clock3 className="mx-auto h-6 w-6 text-white/20" />
                            <p className="mt-1.5 text-xs font-semibold text-white/50">
                              No scheduled items in this category
                            </p>
                            <p className="text-[10px] text-white/35 mt-0.5">
                              Schedule a meeting, call, or reminder to receive future alerts.
                            </p>
                          </div>
                        ) : (
                          filteredNotifications.map((ev) => {
                            const isMeeting = ev.type === "meeting";
                            const isCall = ev.type === "call";
                            const isToday = ev.date === new Date().toISOString().slice(0, 10);

                            return (
                              <div
                                key={ev.id}
                                className="group relative flex items-start gap-3 rounded-2xl border border-white/5 bg-white/[0.03] p-2.5 transition-all hover:border-white/15 hover:bg-white/[0.06]"
                              >
                                <div
                                  className={cn(
                                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-bold shadow-xs",
                                    isMeeting
                                      ? "bg-blue-500/15 text-blue-400 border border-blue-500/20"
                                      : isCall
                                        ? "bg-purple-500/15 text-purple-400 border border-purple-500/20"
                                        : "bg-amber-500/15 text-amber-400 border border-amber-500/20",
                                  )}
                                >
                                  {isMeeting ? "🤝" : isCall ? "📞" : "⏰"}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <p className="truncate font-semibold text-xs text-white">
                                      {ev.title}
                                    </p>
                                    {isToday && (
                                      <span className="rounded-sm bg-orange-500/20 px-1 py-0.2 text-[9px] font-black uppercase tracking-wider text-orange-400">
                                        Today
                                      </span>
                                    )}
                                  </div>

                                  <p className="mt-0.5 text-[10px] text-white/55 flex items-center gap-1.5">
                                    <Clock3 className="h-3 w-3 text-orange-400/80" />
                                    <span>{formatScheduleDateTime(ev)}</span>
                                  </p>

                                  {ev.contact && (
                                    <p className="mt-0.5 text-[10px] text-white/65 truncate">
                                      With {ev.contact}
                                    </p>
                                  )}
                                </div>

                                <Link
                                  to="/calendar"
                                  onClick={() => setNotificationsOpen(false)}
                                  className="self-center opacity-0 group-hover:opacity-100 transition-opacity text-white/65 hover:text-orange-400 p-1"
                                  title="View in Calendar"
                                >
                                  <ArrowRight className="h-3.5 w-3.5" />
                                </Link>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* Footer */}
                      <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2.5">
                        <button
                          type="button"
                          onClick={() => {
                            setNotificationsOpen(false);
                            openScheduleForDate(null, "meeting");
                          }}
                          className="text-xs font-bold text-orange-400 hover:text-orange-300 transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Schedule Future Event</span>
                        </button>

                        <Link
                          to="/calendar"
                          onClick={() => setNotificationsOpen(false)}
                          className="text-[11px] font-medium text-white/60 hover:text-white transition-colors flex items-center gap-1"
                        >
                          <span>Open Calendar</span>
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Row 2: Dashboard 1/2 Switcher + Search Bar (Phone View Redesigned) */}
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between pt-1">
              {/* Dashboard 1 / Dashboard 2 Segmented Pill Switcher */}
              <div className="grid grid-cols-2 p-1 rounded-2xl sm:rounded-full border border-white/10 bg-white/[0.04] shadow-inner backdrop-blur-md sm:inline-flex sm:w-auto">
                <button
                  type="button"
                  onClick={() => setActiveTab("executive")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-xl sm:rounded-full py-2 px-3 text-xs font-bold transition-all duration-200 cursor-pointer sm:px-4 sm:py-1.5",
                    activeTab === "executive"
                      ? "bg-gradient-to-r from-[#ff6b2b] to-[#f04400] text-white shadow-md shadow-orange-500/30"
                      : "text-white/60 hover:text-white hover:bg-white/[0.03]",
                  )}
                >
                  <Sparkles className="h-3.5 w-3.5 text-orange-200 sm:hidden" />
                  <span>Executive</span>
                  <span className="hidden sm:inline">(Dashboard 1)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("ops_ledger")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-xl sm:rounded-full py-2 px-3 text-xs font-bold transition-all duration-200 cursor-pointer sm:px-4 sm:py-1.5",
                    activeTab === "ops_ledger"
                      ? "bg-gradient-to-r from-[#ff6b2b] to-[#f04400] text-white shadow-md shadow-orange-500/30"
                      : "text-white/60 hover:text-white hover:bg-white/[0.03]",
                  )}
                >
                  <Layers className="h-3.5 w-3.5 text-orange-200 sm:hidden" />
                  <span>Ops &amp; Ledger</span>
                  <span className="hidden sm:inline">(Dashboard 2)</span>
                </button>
              </div>

              {/* Search Pill */}
              <div ref={searchRef} className="relative w-full sm:w-72 lg:w-80">
                <div className="flex w-full items-center gap-2 rounded-2xl sm:rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 sm:py-1.5 text-xs text-white shadow-inner backdrop-blur-md transition-all focus-within:border-orange-500/50 focus-within:bg-white/[0.08] focus-within:ring-1 focus-within:ring-orange-500/30">
                  <Search className="h-3.5 w-3.5 text-white/40 shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    placeholder="Search something here…"
                    className="w-full bg-transparent text-xs text-white placeholder-white/35 outline-none transition-all"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="text-white/40 hover:text-white cursor-pointer px-1"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Live Search Results Dropdown */}
                {searchFocused && searchResults.length > 0 && (
                  <div className="absolute right-0 top-12 z-50 w-72 rounded-2xl border border-white/10 bg-[#191920]/95 p-2 shadow-2xl backdrop-blur-2xl">
                    <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/65">
                      Search Results
                    </p>
                    <div className="space-y-1">
                      {searchResults.map((res) => (
                        <Link
                          key={res.id}
                          to={res.href}
                          onClick={() => setSearchFocused(false)}
                          className="flex items-center justify-between rounded-xl px-3 py-2 text-xs transition-colors hover:bg-white/10"
                        >
                          <span className="truncate font-medium text-white">{res.title}</span>
                          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold text-orange-400">
                            {res.type}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {activeTab === "executive" ? (
            <>
              {/* ========================================================================= */}
              {/* ROW 1: 6 EXECUTIVE METRIC CARDS MATCHING REFERENCE IMAGE 2 (2 cols mobile, 3 cols desktop) */}
              {/* ========================================================================= */}
              <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-3">
                {/* CARD 1: Cash Balance */}
                <div className="group relative flex flex-col justify-between rounded-xl sm:rounded-2xl border border-white/[0.08] bg-[#0d0d12]/90 p-3 sm:p-5 shadow-lg backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.04]">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-white/50">
                      CASH BALANCE
                    </span>
                    <span className="flex h-6 w-6 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10">
                      <IndianRupee className="h-3 w-3 sm:h-4 sm:w-4 text-emerald-400" />
                    </span>
                  </div>
                  <div className="mt-2.5 sm:mt-4">
                    <div className="truncate text-base sm:text-2xl lg:text-3xl font-black tracking-tight text-white tabular-nums">
                      {formatINRWhole(dashboardData.cashBalance)}
                    </div>
                    <div className="mt-1.5 sm:mt-2.5 flex items-center gap-1">
                      <span className="flex items-center gap-1 text-[10px] sm:text-xs font-semibold text-emerald-400 truncate">
                        <ArrowUpRight className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
                        <span className="sm:hidden">Liquid Capital</span>
                        <span className="hidden sm:inline">Total Liquid Capital</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* CARD 2: Revenue */}
                <div className="group relative flex flex-col justify-between rounded-xl sm:rounded-2xl border border-white/[0.08] bg-[#0d0d12]/90 p-3 sm:p-5 shadow-lg backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.04]">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-white/50">
                      REVENUE
                    </span>
                    <span className="flex h-6 w-6 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-lg border border-rose-500/20 bg-rose-500/10">
                      <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-rose-500" />
                    </span>
                  </div>
                  <div className="mt-2.5 sm:mt-4">
                    <div className="truncate text-base sm:text-2xl lg:text-3xl font-black tracking-tight text-white tabular-nums">
                      {formatINRWhole(dashboardData.revenue)}
                    </div>
                    <div className="mt-1.5 sm:mt-2.5 flex items-center gap-1">
                      <span className="truncate text-[10px] sm:text-xs font-semibold text-emerald-400">
                        <span className="sm:hidden">Verified Payments</span>
                        <span className="hidden sm:inline">Verified Payments Collected</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* CARD 3: Expenses */}
                <div className="group relative flex flex-col justify-between rounded-xl sm:rounded-2xl border border-white/[0.08] bg-[#0d0d12]/90 p-3 sm:p-5 shadow-lg backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.04]">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-white/50">
                      EXPENSES
                    </span>
                    <span className="flex h-6 w-6 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-lg border border-rose-500/20 bg-rose-500/10">
                      <TrendingDown className="h-3 w-3 sm:h-4 sm:w-4 text-rose-500" />
                    </span>
                  </div>
                  <div className="mt-2.5 sm:mt-4">
                    <div className="truncate text-base sm:text-2xl lg:text-3xl font-black tracking-tight text-white tabular-nums">
                      {formatINRWhole(dashboardData.expenses)}
                    </div>
                    <div className="mt-1.5 sm:mt-2.5 flex items-center gap-1">
                      <span className="truncate text-[10px] sm:text-xs font-semibold text-rose-500">
                        <span className="sm:hidden">Expenditures</span>
                        <span className="hidden sm:inline">Category Expenditures</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* CARD 4: Revenue Booked */}
                <div className="group relative flex flex-col justify-between rounded-xl sm:rounded-2xl border border-white/[0.08] bg-[#0d0d12]/90 p-3 sm:p-5 shadow-lg backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.04]">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-white/50">
                      <span className="sm:hidden">REV BOOKED</span>
                      <span className="hidden sm:inline">REVENUE BOOKED</span>
                    </span>
                    <span className="flex h-6 w-6 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-lg border border-rose-500/20 bg-rose-500/10">
                      <Briefcase className="h-3 w-3 sm:h-4 sm:w-4 text-rose-500" />
                    </span>
                  </div>
                  <div className="mt-2.5 sm:mt-4">
                    <div className="truncate text-base sm:text-2xl lg:text-3xl font-black tracking-tight text-white tabular-nums">
                      {formatINRWhole(dashboardData.revenueBooked)}
                    </div>
                    <div className="mt-1.5 sm:mt-2.5 flex items-center gap-1">
                      <span className="truncate text-[10px] sm:text-xs font-semibold text-rose-500">
                        <span className="sm:hidden">Contracts + Rec</span>
                        <span className="hidden sm:inline">Contracts + recurring revenue received</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* CARD 5: Outstanding */}
                <div className="group relative flex flex-col justify-between rounded-xl sm:rounded-2xl border border-white/[0.08] bg-[#0d0d12]/90 p-3 sm:p-5 shadow-lg backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.04]">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-white/50">
                      OUTSTANDING
                    </span>
                    <span className="flex h-6 w-6 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-lg border border-indigo-500/20 bg-indigo-500/10">
                      <FileText className="h-3 w-3 sm:h-4 sm:w-4 text-indigo-400" />
                    </span>
                  </div>
                  <div className="mt-2.5 sm:mt-4">
                    <div className="truncate text-base sm:text-2xl lg:text-3xl font-black tracking-tight text-white tabular-nums">
                      {formatINRWhole(dashboardData.outstandingReceivables)}
                    </div>
                    <div className="mt-1.5 sm:mt-2.5 flex items-center gap-1">
                      <span className="truncate text-[10px] sm:text-xs font-semibold text-indigo-400">
                        <span className="sm:hidden">Client Balances</span>
                        <span className="hidden sm:inline">Outstanding client balances</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* CARD 6: Active MRR */}
                <div className="group relative flex flex-col justify-between rounded-xl sm:rounded-2xl border border-white/[0.08] bg-[#0d0d12]/90 p-3 sm:p-5 shadow-lg backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.04]">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-white/50">
                      ACTIVE MRR
                    </span>
                    <span className="flex h-6 w-6 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10">
                      <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-amber-400" />
                    </span>
                  </div>
                  <div className="mt-2.5 sm:mt-4">
                    <div className="truncate text-base sm:text-2xl lg:text-3xl font-black tracking-tight text-white tabular-nums">
                      {formatINRWhole(dashboardData.activeMrr)}
                    </div>
                    <div className="mt-1.5 sm:mt-2.5 flex items-center gap-1">
                      <span className="truncate text-[10px] sm:text-xs font-semibold text-amber-400">
                        <span className="sm:hidden">Retainers / mo</span>
                        <span className="hidden sm:inline">Started retainers / month</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ========================================================================= */}
              {/* ROW 2: ACTIVITY TRACKING CHART + SPOTLIGHT FEATURE CARD */}
              {/* ========================================================================= */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                {/* Activity Tracking Spline Chart (2 Columns) */}
                <div className="relative flex flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-xl backdrop-blur-md lg:col-span-2">
                  {/* Chart Header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold tracking-tight text-white">Activity Tracking</h2>
                      <p className="text-[11px] text-white/70">Cashflow Inflow Momentum</p>
                    </div>

                    {/* Timeframe Dropdown Pill */}
                    <div className="flex items-center rounded-full border border-white/10 bg-white/5 p-0.5">
                      <button
                        type="button"
                        onClick={() => setActivityTimeframe("weekly")}
                        className={cn(
                          "rounded-full px-3 py-1 text-[10px] font-bold transition-all",
                          activityTimeframe === "weekly"
                            ? "bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-md shadow-orange-500/20"
                            : "text-white/60 hover:text-white",
                        )}
                      >
                        Weekly
                      </button>
                      <button
                        type="button"
                        onClick={() => setActivityTimeframe("monthly")}
                        className={cn(
                          "rounded-full px-3 py-1 text-[10px] font-bold transition-all",
                          activityTimeframe === "monthly"
                            ? "bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-md shadow-orange-500/20"
                            : "text-white/60 hover:text-white",
                        )}
                      >
                        Monthly
                      </button>
                    </div>
                  </div>

                  {/* Curved Spline Chart */}
                  <div className="relative mt-4 h-36 w-full">
                    {activePoint && (
                      <div
                        className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full transform rounded-full border border-orange-500/40 bg-orange-500/90 px-3 py-1 text-[10px] font-bold text-white shadow-lg backdrop-blur-md"
                        style={{ left: `${(activePoint.x / chartWidth) * 100}%`, top: `${activePoint.y - 8}px` }}
                      >
                        {formatINRWhole(activePoint.value)}
                      </div>
                    )}

                    <svg className="h-full w-full overflow-visible" viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="splineGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#ff6b2b" stopOpacity="0.45" />
                          <stop offset="60%" stopColor="#f04400" stopOpacity="0.1" />
                          <stop offset="100%" stopColor="#141419" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>

                      <line x1={paddingX} y1="30" x2={chartWidth - paddingX} y2="30" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                      <line x1={paddingX} y1="70" x2={chartWidth - paddingX} y2="70" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                      <line x1={paddingX} y1="110" x2={chartWidth - paddingX} y2="110" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />

                      <path d={areaD} fill="url(#splineGradient)" />
                      <path
                        d={pathD}
                        fill="none"
                        stroke="#ff6b2b"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        className="filter drop-shadow-[0_0_12px_rgba(255,107,43,0.7)]"
                      />

                      {points.map((pt, idx) => (
                        <g key={pt.label}>
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r="4"
                            fill="#ff6b2b"
                            stroke="#ffffff"
                            strokeWidth="2"
                            className="cursor-pointer transition-transform hover:scale-150"
                            onMouseEnter={() => setHoveredPointIndex(idx)}
                          />
                        </g>
                      ))}
                    </svg>
                  </div>

                  <div className="mt-2 flex justify-between px-6 text-[10px] font-bold text-white/65">
                    {chartPoints.map((pt) => (
                      <span key={pt.label}>{pt.label}</span>
                    ))}
                  </div>
                </div>

                {/* Spotlight Feature Card */}
                <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#1a1a24] to-[#121217] p-5 shadow-xl backdrop-blur-md">
                  <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-orange-500/15 blur-2xl" />

                  <div>
                    <div className="flex items-center justify-between">
                      <span className="rounded-full bg-orange-500/20 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-orange-400">
                        Active Spotlight
                      </span>
                      <Link
                        to="/projects"
                        className="text-[10px] font-semibold text-white/50 transition-colors hover:text-white"
                      >
                        View all &rarr;
                      </Link>
                    </div>

                    <h3 className="mt-3 text-base font-bold text-white">
                      {dashboardData.spotlightProject?.client || dashboardData.spotlightProject?.name || "Corporate Client Retainer"}
                    </h3>
                    <p className="mt-0.5 text-xs text-white/70">
                      {dashboardData.spotlightProject?.name ? `${dashboardData.spotlightProject.client} · ${dashboardData.spotlightProject.name}` : "Admark Digitals Prime Account"}
                    </p>

                    {/* Retainer & Status */}
                    <div className="mt-4 grid grid-cols-2 gap-3 border-y border-white/10 py-3">
                      <div>
                        <span className="text-[10px] font-medium text-white/65">Monthly Retainer</span>
                        <p className="text-base font-bold text-white">
                          {formatINRWhole(dashboardData.spotlightProject?.billing?.monthlyAmount || dashboardData.activeMrr / 2)}
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] font-medium text-white/65">Account Status</span>
                        <p className="flex items-center gap-1 text-xs font-semibold text-emerald-400">
                          <ShieldCheck className="h-3.5 w-3.5" /> Active Billing
                        </p>
                      </div>
                    </div>

                    {/* Operational Intel: Recovery Progress & Milestone */}
                    {spotlightDetails && (
                      <div className="mt-3 space-y-2.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[11px] text-white/70">Contract Recovery</span>
                          <span className="font-bold text-orange-400">
                            {formatINRWhole(spotlightDetails.received)} / {formatINRWhole(spotlightDetails.target)} ({spotlightDetails.recoveryPct}%)
                          </span>
                        </div>
                        {/* Progress Bar */}
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-500"
                            style={{ width: `${spotlightDetails.recoveryPct}%` }}
                          />
                        </div>

                        {/* Milestone Intel */}
                        <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 text-xs">
                          <div className="min-w-0 pr-2">
                            <span className="text-[9px] uppercase font-bold tracking-wider text-white/65 block">
                              Next Milestone
                            </span>
                            <span className="truncate font-semibold text-white block">
                              {spotlightDetails.nextMilestone?.name || "Production Delivery Sprint"}
                            </span>
                          </div>
                          <span className="rounded-lg bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 text-[10px] font-bold text-orange-400 shrink-0">
                            {spotlightDetails.nextMilestone?.dueDate ? `Due ${spotlightDetails.nextMilestone.dueDate}` : "On Track"}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex gap-2">
                    {dashboardData.spotlightProject && (
                      <Link
                        to="/projects/$id"
                        params={{ id: dashboardData.spotlightProject.id }}
                        className="flex-1"
                      >
                        <button
                          type="button"
                          className="w-full rounded-xl bg-white/10 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/20 cursor-pointer"
                        >
                          Open Project
                        </button>
                      </Link>
                    )}
                    <Link to="/invoices" className="flex-1">
                      <button
                        type="button"
                        className="w-full rounded-xl bg-orange-500 py-2 text-xs font-semibold text-white shadow-md shadow-orange-500/30 transition-transform hover:scale-[1.02] cursor-pointer"
                      >
                        Bill Now
                      </button>
                    </Link>
                  </div>
                </div>
              </div>

              {/* ========================================================================= */}
              {/* ROW 3: HORIZONTAL ACTION / PLAN CARDS */}
              {/* ========================================================================= */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-1 rounded-full bg-orange-500" />
                    <h2 className="text-sm font-bold tracking-tight text-white">Operations Center</h2>
                  </div>
                  <Link
                    to="/ops"
                    className="text-[11px] font-semibold text-white/70 transition-colors hover:text-white"
                  >
                    View all &rarr;
                  </Link>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {/* CARD 1: ACTIVE RETAINERS */}
                  <Link
                    to="/accounts/retainers"
                    className="group relative flex flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-[#ff6b2b] to-[#f04400] p-5 text-white shadow-xl shadow-orange-500/25 transition-all duration-300 hover:scale-[1.02]"
                  >
                    <div>
                      <span className="inline-block rounded-full bg-white/20 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white backdrop-blur-md">
                        Day 1 · Active Retainers
                      </span>
                      <h3 className="mt-3 text-base font-bold text-white">Started Contracts</h3>
                      <p className="mt-1 text-xs text-white/90">
                        {dashboardData.activeRetainersCount} Active Clients billing {formatINRWhole(dashboardData.activeMrr)}/month
                      </p>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-[11px] font-bold underline underline-offset-2">
                        Open Retainers &rarr;
                      </span>
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 backdrop-blur-md">
                        <Sparkles className="h-4 w-4 text-white" />
                      </div>
                    </div>
                  </Link>

                  {/* CARD 2: INVOICES */}
                  <Link
                    to="/invoices"
                    className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-white shadow-lg backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.06]"
                  >
                    <div>
                      <span className="inline-block rounded-full bg-white/10 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/70">
                        Day 2 · Invoices
                      </span>
                      <h3 className="mt-3 text-base font-bold text-white">Invoices & Receipts</h3>
                      <p className="mt-1 text-xs text-white/70">
                        Verified GST receipts, PDF generation, and outstanding dues tracking.
                      </p>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-[11px] font-bold text-orange-400 group-hover:underline">
                        Manage Invoices &rarr;
                      </span>
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white/70">
                        <FileText className="h-4 w-4" />
                      </div>
                    </div>
                  </Link>

                  {/* CARD 3: PIPELINE & CRM */}
                  <Link
                    to="/leads"
                    className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-white shadow-lg backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.06]"
                  >
                    <div>
                      <span className="inline-block rounded-full bg-white/10 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/70">
                        Day 3 · Sales Pipeline
                      </span>
                      <h3 className="mt-3 text-base font-bold text-white">Deals & Opportunities</h3>
                      <p className="mt-1 text-xs text-white/70">
                        New leads in meeting scheduled, proposal sent, and closing stages.
                      </p>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-[11px] font-bold text-orange-400 group-hover:underline">
                        View Pipeline &rarr;
                      </span>
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white/60">
                        <Users className="h-4 w-4" />
                      </div>
                    </div>
                  </Link>
                </div>
              </div>
            </>
          ) : (
            /* ========================================================================= */
            /* TAB 2: DETAILED OPS & LEDGER VIEW (When toggled to Dashboard 2) */
            /* ========================================================================= */
            <div className="space-y-6">
              {/* Ops & Ledger 4 KPI Overview Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 shadow-lg backdrop-blur-md">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-white/50">Current Cashflow</span>
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                      <IndianRupee className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="mt-4">
                    <div className="text-2xl font-bold tracking-tight text-white tabular-nums sm:text-3xl">
                      {formatINRWhole(dashboardData.cashBalance)}
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                        <ArrowUpRight className="h-3 w-3" /> Total Liquid Capital
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 shadow-lg backdrop-blur-md">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-white/50">Verified Inflows</span>
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                      <TrendingUp className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="mt-4">
                    <div className="text-2xl font-bold tracking-tight text-emerald-400 tabular-nums sm:text-3xl">
                      +{formatINRWhole(dashboardData.revenue)}
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" /> Payments Collected
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 shadow-lg backdrop-blur-md">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-white/50">Total Outflow</span>
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-400">
                      <TrendingDown className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="mt-4">
                    <div className="text-2xl font-bold tracking-tight text-rose-400 tabular-nums sm:text-3xl">
                      -{formatINRWhole(dashboardData.expenses)}
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-400">
                        Expenses Deducted
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 shadow-lg backdrop-blur-md">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-white/50">Outstanding</span>
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-400">
                      <Clock3 className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="mt-4">
                    <div className="text-2xl font-bold tracking-tight text-amber-400 tabular-nums sm:text-3xl">
                      {formatINRWhole(dashboardData.outstandingReceivables)}
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-400">
                        <Zap className="h-3 w-3" /> Pending Recovery
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Transactions Ledger Panel */}
              <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5 shadow-xl backdrop-blur-md">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                  <div>
                    <h2 className="text-base font-bold text-white">Financial Movements & Recent Payments</h2>
                    <p className="text-xs text-white/70">Verified payment inflows, invoices, and expense deductions.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link to="/accounts">
                      <Button size="sm" variant="outline" className="border-white/10 text-white hover:bg-white/10">
                        Full Ledger &rarr;
                      </Button>
                    </Link>
                    <Link to="/accounts/billing">
                      <Button size="sm" variant="outline" className="border-white/10 text-white hover:bg-white/10">
                        Billing Details
                      </Button>
                    </Link>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[32rem]">
                    <thead className="border-b border-white/10 text-white/65">
                      <tr>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Description</th>
                        <th className="py-2.5 px-3">Method</th>
                        <th className="py-2.5 px-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {dashboardData.recentPayments.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-white/65">
                            No recent transactions recorded.
                          </td>
                        </tr>
                      ) : (
                        dashboardData.recentPayments.map((p) => (
                          <tr key={p.id} className="transition-colors hover:bg-white/[0.03]">
                            <td className="py-3 px-3 text-white/60 font-mono">{p.date}</td>
                            <td className="py-3 px-3 font-semibold text-white">{p.description}</td>
                            <td className="py-3 px-3 text-white/50 uppercase">{p.paymentMethod}</td>
                            <td className="py-3 px-3 text-right font-bold text-emerald-400 tabular-nums font-mono">
                              +{formatINRWhole(p.amount)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* ========================================================================= */}
        {/* RIGHT FLOATING GLASS PANEL (Profile + Calendar + Scheduled in screenshot) */}
        {/* ========================================================================= */}
        <aside className="w-full shrink-0 space-y-6 rounded-[36px] border border-white/[0.08] bg-[#141419]/85 p-6 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] backdrop-blur-3xl xl:w-96">
          {/* Top User Profile Pill (Matching Lionel Messi pill in screenshot) */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-tr from-orange-500 to-amber-500 text-lg font-bold text-white shadow-md">
                  {displayName.slice(0, 2).toUpperCase()}
                </div>
                <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#141419] bg-emerald-500 shadow-[0_0_8px_#10b981]" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-bold text-white">{displayName}</h2>
                <p className="text-[11px] text-white/70">@admin · Admark OS</p>
              </div>
            </div>

            {/* 3 Stats in Columns */}
            <div className="mt-4 grid grid-cols-3 divide-x divide-white/10 rounded-xl bg-white/[0.03] py-2.5 text-center">
              <div className="min-w-0 px-1">
                <p className="truncate text-sm font-bold text-white">{dashboardData.totalClientsCount}</p>
                <p className="text-[10px] text-white/65">Clients</p>
              </div>
              <div className="min-w-0 px-1">
                <p className="truncate text-sm font-bold text-white">{dashboardData.activeProjectsCount}</p>
                <p className="text-[10px] text-white/65">Projects</p>
              </div>
              <div className="min-w-0 px-1">
                <p
                  className="truncate text-xs font-bold text-orange-400 sm:text-sm"
                  title={formatINRWhole(dashboardData.activeMrr)}
                >
                  {formatINRWhole(dashboardData.activeMrr)}
                </p>
                <p className="text-[10px] text-white/65">MRR</p>
              </div>
            </div>
          </div>

          {/* Interactive Dark Glass Calendar Widget (Matching screenshot) */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-md">
            {/* Month Header with Nav Arrows */}
            <div className="flex items-center justify-between pb-3">
              <h3 className="text-xs font-bold text-white">{calendarData.monthLabel}</h3>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setCalendarDate(
                      (d) => new Date(d.getFullYear(), d.getMonth() - 1, 1),
                    )
                  }
                  className="rounded-lg p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                  aria-label="Previous Month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setCalendarDate(
                      (d) => new Date(d.getFullYear(), d.getMonth() + 1, 1),
                    )
                  }
                  className="rounded-lg p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                  aria-label="Next Month"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Weekday headers: Su Mo Tu We Th Fr Sa */}
            <div className="grid grid-cols-7 text-center text-[10px] font-bold text-white/65">
              <span>Su</span>
              <span>Mo</span>
              <span>Tu</span>
              <span>We</span>
              <span>Th</span>
              <span>Fr</span>
              <span>Sa</span>
            </div>

            {/* Days Grid with Colorful Event Indicator Pills (Matching 21 green, 22 orange, 26 red in screenshot!) */}
            <div className="mt-2 grid grid-cols-7 gap-y-1 text-center text-xs">
              {/* Blank offset days */}
              {Array.from({ length: calendarData.firstDayIndex }).map((_, idx) => (
                <div key={`offset-${idx}`} className="h-8" />
              ))}

              {calendarData.days.map((item) => {
                const hasMeeting = item.events.some((e) => e.type === "meeting");
                const hasCall = item.events.some((e) => e.type === "call");
                const hasDue = item.events.some((e) => e.due || e.type === "reminder");
                const isSelected = selectedCalendarDay === item.day;

                // Color badges matching the reference screenshot!
                let pillClass = "text-white/70 hover:bg-white/10";
                if (hasDue) {
                  pillClass = "bg-rose-500 text-white font-bold shadow-[0_0_10px_#f43f5e]";
                } else if (hasMeeting) {
                  pillClass = "bg-emerald-500 text-white font-bold shadow-[0_0_10px_#10b981]";
                } else if (hasCall) {
                  pillClass = "bg-orange-500 text-white font-bold shadow-[0_0_10px_#ff6b2b]";
                } else if (item.isToday) {
                  pillClass = "border border-orange-500 text-orange-400 font-bold";
                }

                return (
                  <button
                    key={item.day}
                    type="button"
                    onClick={() =>
                      setSelectedCalendarDay((prev) => (prev === item.day ? null : item.day))
                    }
                    onDoubleClick={() => openScheduleForDate(item.day)}
                    title={`Click to filter, double click to schedule on Day ${item.day}`}
                    className={cn(
                      "mx-auto flex h-7 w-7 items-center justify-center rounded-full text-[11px] transition-all cursor-pointer",
                      pillClass,
                      isSelected && "ring-2 ring-white ring-offset-2 ring-offset-[#141419]",
                    )}
                  >
                    {item.day}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scheduled Section (Matching "Scheduled" list in reference image) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-3 w-1 rounded-full bg-orange-500" />
                <h3 className="text-xs font-bold text-white">Scheduled</h3>
                {selectedCalendarDay && (
                  <span className="rounded bg-orange-500/20 px-1.5 py-0.5 text-[9px] font-bold text-orange-400">
                    Day {selectedCalendarDay}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openScheduleForDate(selectedCalendarDay)}
                  className="inline-flex items-center gap-1 rounded-lg border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[10px] font-bold text-orange-400 hover:bg-orange-500/20 transition-all cursor-pointer"
                  title="Schedule meeting, call or reminder"
                >
                  <Plus className="h-3 w-3" />
                  {selectedCalendarDay ? `Schedule (${selectedCalendarDay})` : "Schedule"}
                </button>
                <Link
                  to="/calendar"
                  className="text-[10px] font-semibold text-white/50 transition-colors hover:text-white"
                >
                  View all &rarr;
                </Link>
              </div>
            </div>

            {/* List of Scheduled Items */}
            <div className="space-y-2.5">
              {displayedSchedule.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 p-4 text-center">
                  <p className="text-xs text-white/50">
                    {selectedCalendarDay
                      ? `No events on ${calendarDate.toLocaleString("default", { month: "short" })} ${selectedCalendarDay}.`
                      : "No scheduled events for today."}
                  </p>
                  <button
                    type="button"
                    onClick={() => openScheduleForDate(selectedCalendarDay)}
                    className="mt-2.5 inline-flex items-center gap-1.5 rounded-xl border border-orange-500/30 bg-orange-500/15 px-3 py-1.5 text-xs font-bold text-orange-400 hover:bg-orange-500/25 transition-all cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" /> Schedule on this Day
                  </button>
                </div>
              ) : (
                displayedSchedule.map((ev) => {
                  const isCall = ev.type === "call";
                  const isReminder = ev.type === "reminder";
                  return (
                    <Link
                      key={ev.id}
                      to="/calendar"
                      className="group flex items-center justify-between rounded-2xl border border-white/5 bg-white/[0.03] p-3 backdrop-blur-md transition-all hover:border-white/15 hover:bg-white/[0.06]"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                            isCall
                              ? "bg-orange-500/15 text-orange-400"
                              : isReminder
                                ? "bg-rose-500/15 text-rose-400"
                                : "bg-emerald-500/15 text-emerald-400",
                          )}
                        >
                          {isCall ? (
                            <Phone className="h-4 w-4" />
                          ) : isReminder ? (
                            <BellRing className="h-4 w-4" />
                          ) : (
                            <CalendarDays className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-white group-hover:text-orange-400">
                            {ev.title}
                          </p>
                          <p className="truncate text-[10px] text-white/65">
                            {ev.contact ? `${ev.contact} · ` : ""}
                            {formatScheduleDateTime(ev)}
                          </p>
                        </div>
                      </div>
                      <MoreVertical className="h-3.5 w-3.5 shrink-0 text-white/60 group-hover:text-white" />
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Interactive Schedule Dialog for picking dates and scheduling meetings/tasks */}
      <ReminderFormDialog
        open={scheduleDialogOpen}
        onOpenChange={setScheduleDialogOpen}
        reminder={null}
        defaultDate={scheduleDialogDate}
        defaultType={scheduleDialogType}
        onSave={handleSaveScheduleEvent}
      />
    </div>
  );
}
