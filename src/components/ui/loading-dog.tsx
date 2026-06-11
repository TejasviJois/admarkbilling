import { Skeleton } from "@/components/ui/skeleton";

export function LoadingDog({ message = "On it…" }: { message?: string }) {
  return (
    <div
      className="flex min-h-[40vh] flex-col items-center justify-center gap-5 px-4"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="relative">
        <span className="text-6xl animate-bounce select-none" aria-hidden>
          🐕
        </span>
        <span
          className="absolute -right-1 -top-1 h-3 w-3 animate-ping rounded-full bg-primary/60"
          aria-hidden
        />
      </div>
      <p className="text-sm font-medium text-muted-foreground">{message}</p>
      <div className="grid w-full max-w-md gap-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-3/5" />
      </div>
    </div>
  );
}
