import { formatINRCompact, initials, paymentTotal } from "@/lib/team-payroll";
import type { SalaryMonthPayment } from "@/lib/types";
import { cn } from "@/lib/utils";

export function MemberAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <div
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted/70 text-[10px] font-medium text-muted-foreground",
        className,
      )}
    >
      {initials(name)}
    </div>
  );
}

export function PayrollMonthCell({
  payment,
  eligible,
  isCurrent,
  onClick,
  title,
}: {
  payment?: SalaryMonthPayment;
  eligible: boolean;
  isCurrent: boolean;
  onClick?: () => void;
  title?: string;
}) {
  if (!eligible) {
    return <div className="mx-auto h-8 w-8" />;
  }

  const paid = payment != null;
  const modeClass = paid
    ? payment.mode === "partial"
      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
      : payment.mode === "extra"
        ? "bg-sky-500/10 text-sky-600 dark:text-sky-400"
        : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
    : "border border-border/80 bg-muted/30 text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground";

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={paid}
      className={cn(
        "mx-auto inline-flex h-8 min-w-11 items-center justify-center rounded-md px-2 text-[12px] font-semibold transition-colors",
        isCurrent && "ring-1 ring-primary/35",
        modeClass,
        isCurrent && !paid && "border-primary/35 bg-primary/8 text-foreground hover:bg-primary/12",
      )}
    >
      {paid ? (
        <span className="tabular-nums leading-none">{formatINRCompact(paymentTotal(payment))}</span>
      ) : (
        <span className="text-[11px] font-medium">Pay</span>
      )}
    </button>
  );
}
