import { Skeleton } from "@/components/ui/skeleton";

/** Instant shell while InvoiceForm chunk loads — form layout, no heavy deps. */
export function InvoiceFormSkeleton() {
  return (
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
        <Skeleton className="h-11 w-full rounded-md" />
        <Skeleton className="h-11 w-full rounded-md" />
      </aside>
    </div>
  );
}
