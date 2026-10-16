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
    <div className="mb-6 flex flex-col items-start gap-4 sm:mb-8 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <span className="h-6 w-1.5 shrink-0 rounded-full bg-gradient-to-b from-[#ff6b2b] to-[#f04400] shadow-[0_0_12px_#ff6b2b]" />
          <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl md:text-3xl">
            {title}
          </h1>
        </div>
        <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-white/60 md:mt-2 md:text-sm">
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
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-orange-500/20 bg-orange-500/10 text-orange-400 shadow-inner">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-bold tracking-tight text-white sm:text-lg">{title}</h2>
        <p className="mt-0.5 text-xs text-white/50">{description}</p>
      </div>
      {collapsible && (
        <ChevronDown
          className={cn(
            "mt-1 h-5 w-5 shrink-0 text-white/40 transition-transform duration-200",
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
        className="scroll-mt-24 rounded-[28px] border border-white/[0.08] bg-[#141419]/80 p-6 shadow-2xl backdrop-blur-2xl transition-all duration-300 hover:border-white/15 sm:p-7"
      >
        <div className="mb-5 flex items-start justify-between gap-3 border-b border-white/5 pb-4">
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
        className="scroll-mt-24 rounded-[28px] border border-white/[0.08] bg-[#141419]/80 p-6 shadow-2xl backdrop-blur-2xl transition-all duration-300 hover:border-white/15 sm:p-7"
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/5 pb-4">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 flex-1 items-start gap-3 rounded-xl text-left transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40"
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
      <Label htmlFor={id} className="text-xs font-semibold uppercase tracking-wider text-white/50">
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
    <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-xl shadow-lg">
      <table className="w-full min-w-[32rem] text-sm">
        <thead className="border-b border-white/[0.08] bg-white/[0.03] text-left text-[11px] font-bold uppercase tracking-wider text-white/50">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-white/5 transition-colors hover:bg-white/[0.04]">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 text-xs text-white">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footerRow ? (
          <tfoot>
            <tr className="border-t border-white/10 bg-white/[0.03] text-xs font-bold text-white">
              {footerRow.map((cell, j) => (
                <td key={j} className="px-4 py-3">
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
    <span className="inline-flex rounded-full border border-orange-500/30 bg-orange-500/15 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-orange-400 shadow-[0_0_8px_rgba(255,107,43,0.2)]">
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
    return <span className="text-xs text-white/40">—</span>;
  }

  return (
    <div className="flex min-w-[6rem] max-w-[14rem] flex-col gap-0.5 text-xs">
      {tel && (
        <a
          href={`tel:${tel.replace(/\s/g, "")}`}
          className="truncate font-medium text-orange-400 transition-colors hover:text-orange-300 hover:underline"
          title={tel}
        >
          {tel}
        </a>
      )}
      {mail && (
        <a
          href={`mailto:${mail}`}
          className="truncate break-all text-white/60 transition-colors hover:text-orange-400 hover:underline"
          title={mail}
        >
          {mail}
        </a>
      )}
      {!tel && !mail && legacy && (
        <span className="truncate text-white/40" title={legacy}>
          {legacy}
        </span>
      )}
    </div>
  );
}

export function RowEdit({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/60 transition-all hover:border-orange-500/40 hover:bg-orange-500/20 hover:text-white"
      aria-label="Edit"
    >
      <Pencil className="h-3.5 w-3.5" />
    </button>
  );
}

export function RowDelete({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/60 transition-all hover:border-rose-500/40 hover:bg-rose-500/20 hover:text-rose-400"
      aria-label="Remove"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

export function EmptyRow({ message }: { message: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-8 text-center text-xs text-white/40">
      {message}
    </p>
  );
}

export function OperationsLoading() {
  return <LoadingDog message="Loading data…" />;
}
