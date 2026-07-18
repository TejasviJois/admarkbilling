import { Skeleton } from "@/components/ui/skeleton";

/** Instant shell while InvoiceForm chunk loads — form layout, no heavy deps. */
export function InvoiceFormSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:flex-wrap">
          <Skeleton className="h-10 w-full rounded-md sm:w-32" />
          <Skeleton className="h-10 w-full rounded-md sm:w-24" />
          <Skeleton className="h-10 w-full rounded-md sm:w-36" />
        </div>
      </div>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,360px)]">
        <div className="min-w-0 space-y-6">
          <section className="rounded-xl border border-border bg-card p-6">
            <Skeleton className="h-4 w-24" />
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </section>
          <section className="rounded-xl border border-border bg-card p-6">
            <Skeleton className="h-4 w-32" />
            <div className="mt-4 space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </section>
          <section className="rounded-xl border border-border bg-card p-6">
            <Skeleton className="h-4 w-28" />
            <div className="mt-4 space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </section>
        </div>
        <aside className="space-y-4">
          <Skeleton className="h-48 w-full rounded-xl" />
        </aside>
      </div>
    </div>
  );
}
