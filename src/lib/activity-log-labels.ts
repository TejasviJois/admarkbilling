import type { ActivityAction, ActivityEntity } from "./types";

export function entityLabel(entity: ActivityEntity): string {
  switch (entity) {
    case "project":
      return "Project";
    case "partnership":
      return "Partnership";
    case "expense":
      return "Expense";
    case "invoice":
      return "Invoice";
    case "settings":
      return "Settings";
  }
}

export function actionLabel(action: ActivityAction): string {
  switch (action) {
    case "created":
      return "Created";
    case "updated":
      return "Updated";
    case "deleted":
      return "Deleted";
    case "payment_added":
      return "Payment added";
    case "payment_removed":
      return "Payment removed";
  }
}

export function formatActivityTimestamp(ts: number): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ts));
}
