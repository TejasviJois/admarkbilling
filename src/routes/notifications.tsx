import { useState, useMemo } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Bell, Check, Trash2, Eye, EyeOff, ShieldAlert, Sparkles, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OperationsPageHeader, OperationsLoading } from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";

export const Route = createFileRoute("/notifications")({ component: NotificationsPage });

function NotificationsPage() {
  const { ops, persist, loading } = useOperations();
  const [filter, setFilter] = useState<"all" | "unread" | "high">("all");
  const router = useRouter();

  const notifications = ops.notifications ?? [];

  const filtered = useMemo(() => {
    return notifications.filter((n) => {
      if (filter === "unread") return !n.read;
      if (filter === "high") return n.priority === "high";
      return true;
    });
  }, [notifications, filter]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);
  const highPriorityCount = useMemo(() => notifications.filter((n) => n.priority === "high").length, [notifications]);

  const toggleRead = (id: string) => {
    const updated = notifications.map((n) => (n.id === id ? { ...n, read: !n.read } : n));
    persist({ ...ops, notifications: updated });
  };

  const deleteNotification = (id: string) => {
    const updated = notifications.filter((n) => n.id !== id);
    persist({ ...ops, notifications: updated });
  };

  const markAllRead = () => {
    const updated = notifications.map((n) => ({ ...n, read: true }));
    persist({ ...ops, notifications: updated });
  };

  const clearAll = () => {
    const confirmClear = confirm("Are you sure you want to clear all notifications?");
    if (confirmClear) {
      persist({ ...ops, notifications: [] });
    }
  };

  const priorityColor = (priority: "low" | "medium" | "high") => {
    if (priority === "high") return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20";
    if (priority === "medium") return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20";
    return "bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/10";
  };

  const moduleIcon = (module: string) => {
    return <Bell className="h-4 w-4 shrink-0 text-muted-foreground" />;
  };

  if (loading) return <OperationsLoading />;

  return (
    <div className="space-y-6">
      <OperationsPageHeader
        title="Notification Center"
        description="Review system warnings, project deadlines, invoice timelines, and database statuses."
      />

      {/* Overview Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Unread Messages</p>
          <p className="text-2xl font-bold text-foreground mt-1 tabular-nums">{unreadCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-semibold text-muted-foreground uppercase">High Priority warnings</p>
          <p className="text-2xl font-bold text-rose-500 mt-1 tabular-nums">{highPriorityCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Total Logs Captured</p>
          <p className="text-2xl font-bold text-foreground mt-1 tabular-nums">{notifications.length}</p>
        </div>
      </div>

      {/* Filters and Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        
        {/* Filter buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto bg-muted/65 p-1 rounded-lg">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              filter === "all" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All Logs
          </button>
          <button
            onClick={() => setFilter("unread")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
              filter === "unread" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Unread
            {unreadCount > 0 && <span className="bg-primary text-primary-foreground font-bold px-1.5 py-0.5 rounded-full text-[9px]">{unreadCount}</span>}
          </button>
          <button
            onClick={() => setFilter("high")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              filter === "high" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            High Priority
          </button>
        </div>

        {/* Action controls */}
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button size="sm" variant="outline" onClick={markAllRead} className="h-8 text-xs font-bold">
              <Check className="mr-1.5 h-3.5 w-3.5" /> Mark all read
            </Button>
          )}
          {notifications.length > 0 && (
            <Button size="sm" variant="ghost" onClick={clearAll} className="h-8 text-xs text-rose-500 hover:bg-rose-500/10 font-bold">
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Clear all
            </Button>
          )}
        </div>

      </div>

      {/* Notifications Listing Grid */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
            <Bell className="mx-auto h-8 w-8 text-muted-foreground opacity-60 animate-pulse" />
            <p className="mt-3 text-sm font-semibold text-muted-foreground">No alerts matching your current filter.</p>
          </div>
        ) : (
          filtered.map((item) => (
            <div
              key={item.id}
              className={`flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-xl border p-4 shadow-sm transition-all duration-200 ${
                item.read
                  ? "bg-card/40 border-border/60 opacity-75"
                  : "bg-card border-border hover:shadow-md hover:border-primary/45"
              }`}
            >
              
              {/* Left: Indicator details */}
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 rounded-md p-1.5 shrink-0 ${priorityColor(item.priority)}`}>
                  {item.priority === "high" ? <ShieldAlert className="h-4 w-4" /> : moduleIcon(item.relatedModule)}
                </span>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className={`text-sm font-bold ${item.read ? "text-muted-foreground" : "text-foreground"}`}>
                      {item.title}
                    </h3>
                    <span className="text-[9px] font-bold text-muted-foreground uppercase bg-muted px-1.5 py-0.5 rounded tracking-wide">
                      {item.relatedModule}
                    </span>
                    {!item.read && (
                      <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed max-w-2xl">{item.message}</p>
                  <p className="mt-1.5 text-[9px] text-muted-foreground font-semibold tabular-nums">{item.timestamp}</p>
                </div>
              </div>

              {/* Right: Actions */}
              <div className="flex items-center gap-2 self-end sm:self-center">
                {item.actionUrl && (
                  <Button
                    size="sm"
                    className="h-8 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/95"
                    onClick={() => void router.navigate({ to: item.actionUrl })}
                  >
                    {item.actionLabel || "Resolve"}
                  </Button>
                )}

                <button
                  onClick={() => toggleRead(item.id)}
                  className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  title={item.read ? "Mark as unread" : "Mark as read"}
                >
                  {item.read ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>

                <button
                  onClick={() => deleteNotification(item.id)}
                  className="rounded p-1.5 text-rose-500/80 hover:bg-rose-500/10 hover:text-rose-500 transition-colors"
                  title="Delete log"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

            </div>
          ))
        )}
      </div>

    </div>
  );
}
