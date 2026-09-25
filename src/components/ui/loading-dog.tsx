import { Skeleton } from "@/components/ui/skeleton";

/** Simple loading placeholder (kept export name for existing call sites). */
export function LoadingDog({ message = "Loading…" }: { message?: string }) {
  return (
    <div
      className="flex min-h-[40vh] flex-col items-center justify-center gap-5 px-4"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary"
        aria-hidden
      />
      <p className="text-sm font-medium text-muted-foreground">{message}</p>
      <div className="grid w-full max-w-md gap-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-3/5" />
      </div>
    </div>
  );
}
