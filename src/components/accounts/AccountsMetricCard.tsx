import { cn } from "@/lib/utils";

export function AccountsMetricCard({
  label,
  value,
  tone,
  hint,
  onClick,
  selected,
}: {
  label: string;
  value: string;
  tone: "positive" | "negative" | "neutral";
  hint?: string;
  onClick?: () => void;
  selected?: boolean;
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-400"
      : tone === "negative"
        ? "text-rose-400"
        : "text-foreground";

  const className = cn(
    "group block w-full rounded-lg border border-border bg-muted/15 p-4 text-left shadow-sm transition-shadow hover:shadow-md",
    onClick && "cursor-pointer hover:border-primary/40",
    selected && "border-primary/50 ring-1 ring-primary/30",
  );

  const body = (
    <>
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <p
        className={`mt-2 text-xl font-semibold tabular-nums tracking-tight sm:text-2xl ${toneClass}`}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {onClick && (
        <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary">
          Tap for breakdown
        </span>
      )}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {body}
      </button>
    );
  }

  return <div className={className}>{body}</div>;
}
