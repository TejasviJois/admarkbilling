import { LoadingDog } from "@/components/ui/loading-dog";
import { Skeleton } from "@/components/ui/skeleton";

/** Shown while a lazy route chunk loads. */
export function RoutePending() {
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <LoadingDog message="Loading page…" />
    </div>
  );
}
