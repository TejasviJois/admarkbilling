import { useState } from "react";
import { ChevronDown, Pencil, Trash2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { LoadingDog } from "@/components/ui/loading-dog";
import { cn } from "@/lib/utils";

export function OperationsPageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col items-start gap-3 sm:mb-8 sm:flex-row sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl md:text-3xl">
          {title}
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground md:mt-2 md:text-[15px]">
          {description}
        </p>
      </div>
      {action ? <div className="w-full sm:w-auto sm:shrink-0">{action}</div> : null}
    </div>
  );
}

export function DataSection({
  title,
  description,
  icon,
  action,
  id,
  children,
  collapsible = false,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  id?: string;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const headerBody = (
    <>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {collapsible && (
        <ChevronDown
          className={cn(
            "mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden
        />
      )}
    </>
  );

  if (!collapsible) {
    return (
      <section
        id={id}
        className="scroll-mt-24 rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">{headerBody}</div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
        {children}
      </section>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <section
        id={id}
        className="scroll-mt-24 rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 flex-1 items-start gap-3 rounded-md text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              aria-expanded={open}
            >
              {headerBody}
            </button>
          </CollapsibleTrigger>
          {action ? (
            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
              {action}
            </div>
          ) : null}
        </div>
        <CollapsibleContent className="mt-5 data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden">
          {children}
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

export function Field({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function DataTable({
  headers,
  rows,
  footerRow,
}: {
  headers: string[];
  rows: React.ReactNode[][];
  footerRow?: React.ReactNode[];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[32rem] text-sm">
        <thead className="border-b border-border bg-muted/60 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-border transition-colors hover:bg-muted/30">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 text-foreground">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footerRow ? (
          <tfoot>
            <tr className="border-t border-border bg-muted/30 font-medium">
              {footerRow.map((cell, j) => (
                <td key={j} className="px-4 py-3 text-foreground">
                  {cell}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

export function StatusPill({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
      {label}
    </span>
  );
}

export function ContactLinks({
  phone,
  email,
  legacyContact,
}: {
  phone?: string;
  email?: string;
  /** Older rows may only have a free-text contact field. */
  legacyContact?: string;
}) {
  const tel = phone?.trim();
  const mail = email?.trim();
  const legacy = legacyContact?.trim();

  if (!tel && !mail && !legacy) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  return (
    <div className="flex min-w-[8rem] flex-col gap-0.5 text-xs">
      {tel && (
        <a
          href={`tel:${tel.replace(/\s/g, "")}`}
          className="font-medium text-primary hover:underline"
        >
          {tel}
        </a>
      )}
      {mail && (
        <a href={`mailto:${mail}`} className="text-primary hover:underline">
          {mail}
        </a>
      )}
      {!tel && !mail && legacy && <span className="text-muted-foreground">{legacy}</span>}
    </div>
  );
}

export function RowEdit({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary"
      aria-label="Edit"
    >
      <Pencil className="h-4 w-4" />
    </button>
  );
}

export function RowDelete({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
      aria-label="Remove"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

export function EmptyRow({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
      {message}
    </p>
  );
}

export function OperationsLoading() {
  return <LoadingDog message="Loading data…" />;
}
