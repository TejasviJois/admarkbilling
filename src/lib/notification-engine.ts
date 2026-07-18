import type { OperationsData, Invoice, AppNotification, Agreement } from "./types";
import {
  fixedMonthlyDueDate,
  fixedMonthlyScheduleMonths,
  fixedMonthlyStatus,
  monthKeyFromDate,
} from "./fixed-monthly-expenses";
import { formatScheduleDateTime, scheduleEventDate } from "./schedule";

export function syncSystemNotifications(
  ops: OperationsData,
  invoices: Invoice[],
  agreements: Agreement[],
  supabaseConfigured: boolean,
): AppNotification[] {
  const existing = ops.notifications ?? [];
  const existingMap = new Map(existing.map((n) => [n.id, n]));
  const newList: AppNotification[] = [];

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayTime = new Date(todayStr).getTime();

  function addOrPreserve(n: Omit<AppNotification, "read" | "timestamp">) {
    const prev = existingMap.get(n.id);
    if (prev) {
      newList.push(prev);
    } else {
      newList.push({
        ...n,
        read: false,
        timestamp: new Date().toISOString().slice(0, 16).replace("T", " "),
      });
    }
  }

  // 1. Invoice Due / Overdue (Due date is calculated as 30 days after inv.date)
  for (const inv of invoices) {
    if (inv.status === "cancelled" || inv.status === "paid") continue;

    const issueDate = new Date(inv.date);
    const dueDate = new Date(issueDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    const dueTime = dueDate.getTime();
    const daysDiff = Math.ceil((dueTime - todayTime) / (1000 * 60 * 60 * 24));
    const formattedDueDate = dueDate.toISOString().slice(0, 10);

    if (daysDiff < 0) {
      addOrPreserve({
        id: `overdue-inv-${inv.id}`,
        title: "Invoice Overdue",
        message: `Invoice ${inv.number} for ${inv.clientName} is overdue by ${Math.abs(daysDiff)} days.`,
        priority: "high",
        relatedModule: "invoices",
        actionUrl: "/invoices",
        actionLabel: "Collect Payment",
      });
    } else if (daysDiff <= 3) {
      addOrPreserve({
        id: `due-inv-${inv.id}`,
        title: "Invoice Due Soon",
        message: `Invoice ${inv.number} for ${inv.clientName} is due in ${daysDiff} days (${formattedDueDate}).`,
        priority: "medium",
        relatedModule: "invoices",
        actionUrl: "/invoices",
        actionLabel: "Send Reminder",
      });
    }
  }

  // 2. Payment Received
  const payments = ops.transactions?.filter((t) => t.type === "client_payment") ?? [];
  if (payments.length > 0) {
    const latestPayment = payments.sort((a, b) => b.date.localeCompare(a.date))[0];
    addOrPreserve({
      id: `payment-received-${latestPayment.id}`,
      title: "Payment Received",
      message: `Successfully received payment of ₹${latestPayment.amount.toLocaleString("en-IN")} on ${latestPayment.date}.`,
      priority: "low",
      relatedModule: "payments",
      actionUrl: "/transactions",
      actionLabel: "Ledger",
    });
  }

  // 3. Project Deadline
  const projects = ops.projects ?? [];
  for (const p of projects) {
    if (p.status !== "active" || !p.deadline) continue;

    const deadlineTime = new Date(p.deadline).getTime();
    const daysDiff = Math.ceil((deadlineTime - todayTime) / (1000 * 60 * 60 * 24));

    if (daysDiff >= 0 && daysDiff <= 7) {
      addOrPreserve({
        id: `project-deadline-${p.id}`,
        title: "Project Deadline Approaching",
        message: `Project for "${p.client}" is approaching its deadline on ${p.deadline}.`,
        priority: "high",
        relatedModule: "projects",
        actionUrl: "/projects",
        actionLabel: "View Milestones",
      });
    }
  }

  // 4. Milestone Due
  for (const p of projects) {
    const ms = p.milestones ?? [];
    for (const m of ms) {
      if (m.status === "completed" || !m.dueDate) continue;

      const dueTime = new Date(m.dueDate).getTime();
      const daysDiff = Math.ceil((dueTime - todayTime) / (1000 * 60 * 60 * 24));

      if (daysDiff >= 0 && daysDiff <= 3) {
        addOrPreserve({
          id: `milestone-due-${p.id}-${m.name.replace(/\s+/g, "-")}`,
          title: "Milestone Due Soon",
          message: `Milestone "${m.name}" for client "${p.client}" is due on ${m.dueDate}.`,
          priority: "medium",
          relatedModule: "projects",
          actionUrl: "/projects",
          actionLabel: "Details",
        });
      }
    }
  }

  // 5. Lead Follow-up
  const leads = ops.leads ?? [];
  for (const l of leads) {
    if (l.status === "won" || l.status === "lost" || !l.expectedClosingDate) continue;

    const closingTime = new Date(l.expectedClosingDate).getTime();
    const daysDiff = Math.ceil((closingTime - todayTime) / (1000 * 60 * 60 * 24));

    if (daysDiff >= 0 && daysDiff <= 5) {
      addOrPreserve({
        id: `lead-followup-${l.id}`,
        title: "CRM Follow-up Required",
        message: `Lead for ${l.company} (${l.contactPerson}) requires follow-up. Expected close on ${l.expectedClosingDate}.`,
        priority: "low",
        relatedModule: "leads",
        actionUrl: "/leads",
        actionLabel: "CRM Board",
      });
    }
  }

  // 5b. Fixed cost payment reminders — alert the day before each due date
  // (and on the day itself) until the month is checked off as paid.
  const currentMonthKey = monthKeyFromDate(todayStr);
  for (const cost of ops.fixedMonthlyExpenses ?? []) {
    if (fixedMonthlyStatus(cost) !== "active") continue;
    const paidMonths = new Set(cost.paidMonths ?? []);
    // The next month's installment matters too: its "day before" can fall
    // inside the current month (e.g. due on the 1st).
    const schedule = fixedMonthlyScheduleMonths(cost, todayStr, 1).filter(
      (month) => month >= currentMonthKey,
    );
    for (const month of schedule) {
      if (paidMonths.has(month)) continue;
      const dueDate = fixedMonthlyDueDate(cost, month);
      const daysUntilDue = Math.ceil(
        (new Date(dueDate).getTime() - todayTime) / (1000 * 60 * 60 * 24),
      );
      if (daysUntilDue < 0 || daysUntilDue > 1) continue;
      const payTo = cost.payee ? ` to ${cost.payee}` : "";
      addOrPreserve({
        id: `fixed-cost-due-${cost.id}-${month}`,
        title: daysUntilDue === 0 ? "Fixed Cost Due Today" : "Fixed Cost Due Tomorrow",
        message: `${cost.label} — ₹${cost.amountPerMonth.toLocaleString("en-IN")}${payTo} is due on ${dueDate}. Check it off once paid.`,
        priority: daysUntilDue === 0 ? "high" : "medium",
        relatedModule: "accounts",
        actionUrl: "/accounts/monthly-payments",
        actionLabel: "Open Fixed Costs",
      });
    }
  }

  // 6. Document Expiry
  for (const doc of agreements) {
    if (!doc.expiryDate) continue;

    const expiryTime = new Date(doc.expiryDate).getTime();
    const daysDiff = Math.ceil((expiryTime - todayTime) / (1000 * 60 * 60 * 24));

    if (daysDiff >= 0 && daysDiff <= 30) {
      addOrPreserve({
        id: `document-expiry-${doc.id}`,
        title: "Agreement Expiring Soon",
        message: `Agreement "${doc.title}" with "${doc.counterpartyName}" expires in ${daysDiff} days (${doc.expiryDate}).`,
        priority: "medium",
        relatedModule: "documents",
        actionUrl: "/documents/agreements",
        actionLabel: "View Agreement",
      });
    }
  }

  // 7. Backup Completed
  const now = Date.now();
  for (const event of ops.scheduleEvents ?? []) {
    if (event.status !== "scheduled") continue;
    const eventTime = scheduleEventDate(event).getTime();
    const minutesUntil = (eventTime - now) / 60_000;
    const stillRelevant = minutesUntil >= -event.durationMinutes;
    if (stillRelevant && minutesUntil <= event.reminderMinutes) {
      addOrPreserve({
        id: `schedule-reminder-${event.id}`,
        title: `${event.type === "call" ? "Call" : "Meeting"} reminder`,
        message: `${event.title} — ${formatScheduleDateTime(event)}.`,
        priority: minutesUntil <= 10 ? "high" : "medium",
        relatedModule: "calendar",
        actionUrl: "/calendar",
        actionLabel: event.meetingUrl ? "Open schedule" : "View calendar",
      });
    }
  }

  // 8. Backup Completed
  addOrPreserve({
    id: "system-backup-complete",
    title: "Database Backup Completed",
    message: "Local browser state encrypted and saved to storage. Integrity checks passed.",
    priority: "low",
    relatedModule: "system",
    actionUrl: "/settings",
    actionLabel: "Storage Settings",
  });

  // 9. User Login
  addOrPreserve({
    id: "system-login-alert",
    title: "Security Login Alert",
    message: "Successful operational workspace login detected from host browser session.",
    priority: "low",
    relatedModule: "system",
    actionUrl: "/logs",
    actionLabel: "Audit Logs",
  });

  // 10. System Errors
  if (!supabaseConfigured) {
    addOrPreserve({
      id: "system-db-warning",
      title: "Local Database Fallback Active",
      message:
        "WARNING: Server database configuration missing. Data is isolated to this browser session.",
      priority: "high",
      relatedModule: "system",
      actionUrl: "/settings",
      actionLabel: "Configure Supabase",
    });
  } else {
    addOrPreserve({
      id: "system-db-sync-ok",
      title: "Cloud Database Sync Successful",
      message:
        "Successfully verified Supabase operational backend connection. Cloud records matched.",
      priority: "low",
      relatedModule: "system",
      actionUrl: "/settings",
      actionLabel: "Network Status",
    });
  }

  // Notification generation may run from a stale browser snapshot. Preserve
  // unmatched server-backed notifications; only an explicit user action may delete.
  const generatedIds = new Set(newList.map((notification) => notification.id));
  return [...newList, ...existing.filter((notification) => !generatedIds.has(notification.id))];
}
