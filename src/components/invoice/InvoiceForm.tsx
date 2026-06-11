import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Trash2, Eye } from "lucide-react";
import { logClientError } from "@/lib/client-logger";
import { upsertInvoice } from "@/lib/storage";
import { nextInvoiceNumberFromList } from "@/lib/invoice-number";
import { computeTotals, formatINR, lineAmount } from "@/lib/invoice-calc";
import { rupeesInWords } from "@/lib/number-to-words";
import type { Invoice, LineItem } from "@/lib/types";
import { KNOWN_CLIENT_NAMES } from "@/lib/client-directory";
import { BUSINESS_TYPE_OPTIONS } from "@/lib/business-type-options";
import { autoFillBusinessTypeForClientName } from "@/lib/client-business-autofill";
import { KNOWN_CONTACT_PERSON_NAMES } from "@/lib/contact-person-directory";
import { useCompany } from "@/hooks/use-company";
import { useInvoices } from "@/hooks/use-invoices";
import { queryKeys } from "@/lib/query-keys";
import { writeClientCache } from "@/lib/client-data-cache";
import { LoadingDog } from "@/components/ui/loading-dog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const InvoicePreview = lazy(() => import("./InvoicePreview"));

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const blankItem = (): LineItem => ({ id: uid(), description: "", quantity: 1, rate: 0 });

interface Props {
  onSaved?: (inv: Invoice) => void;
}

export default function InvoiceForm({ onSaved }: Props) {
  const queryClient = useQueryClient();
  const { company } = useCompany();
  const { invoices } = useInvoices();
  const [number, setNumber] = useState("");
  const [date, setDate] = useState(todayIso());
  const [clientName, setClientName] = useState("");
  const [clientBusinessType, setClientBusinessType] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientContact, setClientContact] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientGstin, setClientGstin] = useState("");
  const [items, setItems] = useState<LineItem[]>([blankItem()]);
  const [advance, setAdvance] = useState(0);
  const [taxPercent, setTaxPercent] = useState(0);
  const [remarks, setRemarks] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [paymentMode, setPaymentMode] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [status, setStatus] = useState<Invoice["status"]>("paid");
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    setNumber(nextInvoiceNumberFromList(invoices, date));
  }, [date, invoices]);

  /** When client / company name matches partner or client sheet, fill Type of business */
  useEffect(() => {
    const next = autoFillBusinessTypeForClientName(clientName);
    if (next !== undefined) {
      setClientBusinessType(next);
    }
  }, [clientName]);

  const updateItem = (id: string, patch: Partial<LineItem>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const removeItem = (id: string) =>
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((it) => it.id !== id)));

  const draft: Invoice = useMemo(
    () => ({
      id: "draft",
      number,
      date,
      clientName,
      clientBusinessType: clientBusinessType.trim() || undefined,
      clientAddress,
      clientContact,
      clientPhone,
      clientEmail,
      clientGstin,
      items,
      advance,
      taxPercent,
      remarks,
      paymentTerms,
      paymentMode,
      paymentDate,
      status,
      createdAt: Date.now(),
    }),
    [
      number,
      date,
      clientName,
      clientBusinessType,
      clientAddress,
      clientContact,
      clientPhone,
      clientEmail,
      clientGstin,
      items,
      advance,
      taxPercent,
      remarks,
      paymentTerms,
      paymentMode,
      paymentDate,
      status,
    ],
  );

  const totals = computeTotals(draft);

  const validate = (): string | null => {
    if (!clientName.trim()) return "Client name is required.";
    if (items.every((i) => !i.description.trim())) return "Add at least one service.";
    if (items.some((i) => Number(i.rate) < 0 || Number(i.quantity) < 0))
      return "Quantities and rates must be non-negative.";
    return null;
  };

  const persistInvoice = async (then?: (inv: Invoice) => void) => {
    const err = validate();
    if (err) {
      alert(err);
      return;
    }
    const assignedNumber = nextInvoiceNumberFromList(invoices, date);
    const inv: Invoice = { ...draft, id: uid(), number: assignedNumber };
    try {
      await upsertInvoice(inv);
      const nextList = [inv, ...invoices.filter((i) => i.id !== inv.id)];
      queryClient.setQueryData(queryKeys.invoices, nextList);
      writeClientCache("invoices", nextList);
      then?.(inv);
      onSaved?.(inv);
      setNumber(nextInvoiceNumberFromList(nextList, date));
    } catch (e) {
      logClientError("invoiceForm.persist", e);
      alert(e instanceof Error ? e.message : "Could not save invoice.");
    }
  };

  const handleGenerate = () => {
    void persistInvoice(async (inv) => {
      const { downloadInvoicePdf } = await import("@/lib/pdf");
      await downloadInvoicePdf(inv, company);
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Step 1 — Details
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Create new invoice</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Invoice number is assigned automatically in sequence for the financial year
            (AM/YY-YY/0001).
          </p>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
          <button
            type="button"
            onClick={handleGenerate}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 sm:w-auto"
          >
            <Save className="h-4 w-4" /> Download
          </button>
          <button
            type="button"
            onClick={() => void persistInvoice()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-input bg-card px-4 py-2.5 text-sm font-semibold hover:bg-secondary sm:w-auto"
          >
            Save only
          </button>
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-input bg-card px-4 py-2.5 text-sm hover:bg-secondary sm:w-auto"
          >
            <Eye className="h-4 w-4" /> Show preview
          </button>
        </div>
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,360px)]">
      <div className="min-w-0 space-y-6">
        <Section title="Invoice info">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Invoice number">
              <input
                value={number}
                readOnly
                aria-readonly="true"
                className={`${inputCls} cursor-default bg-muted/40 text-foreground`}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Auto-generated sequentially for the financial year (e.g. AM/26-27/0001).
              </p>
            </Field>
            <Field label="Date">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Invoice["status"])}
                className={inputCls}
              >
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
                <option value="partial">Partial</option>
                <option value="overdue">Overdue</option>
              </select>
            </Field>
          </div>
        </Section>

        <Section title="Bill to">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Client / company name *">
              <select
                aria-label="Pick a saved client"
                className={`${inputCls} mb-2 text-muted-foreground`}
                value={KNOWN_CLIENT_NAMES.includes(clientName) ? clientName : ""}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) setClientName(v);
                }}
              >
                <option value="">Select saved client…</option>
                {KNOWN_CLIENT_NAMES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <input
                list="admark-client-names"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className={inputCls}
                placeholder="Or type any client / company name"
              />
              <datalist id="admark-client-names">
                {KNOWN_CLIENT_NAMES.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </Field>
            <Field label="Type of business">
              <select
                aria-label="Pick a type of business"
                className={`${inputCls} mb-2 text-muted-foreground`}
                value={
                  BUSINESS_TYPE_OPTIONS.includes(clientBusinessType.trim())
                    ? clientBusinessType.trim()
                    : ""
                }
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) setClientBusinessType(v);
                }}
              >
                <option value="">Select type of business…</option>
                {BUSINESS_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                list="admark-business-types"
                value={clientBusinessType}
                onChange={(e) => setClientBusinessType(e.target.value)}
                className={inputCls}
                placeholder="Or type any business type"
              />
              <datalist id="admark-business-types">
                {BUSINESS_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
            <Field label="Contact person">
              <select
                aria-label="Pick a saved contact person"
                className={`${inputCls} mb-2 text-muted-foreground`}
                value={
                  KNOWN_CONTACT_PERSON_NAMES.includes(clientContact.trim())
                    ? clientContact.trim()
                    : ""
                }
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) setClientContact(v);
                }}
              >
                <option value="">Select contact person…</option>
                {KNOWN_CONTACT_PERSON_NAMES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <input
                list="admark-contact-persons"
                value={clientContact}
                onChange={(e) => setClientContact(e.target.value)}
                className={inputCls}
                placeholder="Or type any contact name"
              />
              <datalist id="admark-contact-persons">
                {KNOWN_CONTACT_PERSON_NAMES.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </Field>
            <Field label="Phone">
              <input
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Email">
              <input
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <textarea
                value={clientAddress}
                onChange={(e) => setClientAddress(e.target.value)}
                rows={2}
                className={inputCls}
              />
            </Field>
            <Field label="GSTIN / Company No.">
              <input
                value={clientGstin}
                onChange={(e) => setClientGstin(e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>
        </Section>

        <Section title="Services">
          <div className="space-y-3">
            <div className="hidden grid-cols-[1fr_80px_120px_120px_40px] gap-3 px-2 text-xs uppercase tracking-wider text-muted-foreground sm:grid">
              <div>Description</div>
              <div className="text-right">Qty</div>
              <div className="text-right">Rate (₹)</div>
              <div className="text-right">Amount</div>
              <div />
            </div>
            {items.map((it) => (
              <div
                key={it.id}
                className="grid grid-cols-1 gap-3 rounded-md border border-border bg-background p-3 sm:grid-cols-[1fr_80px_120px_120px_40px] sm:items-center sm:border-0 sm:bg-transparent sm:p-0"
              >
                <input
                  value={it.description}
                  onChange={(e) => updateItem(it.id, { description: e.target.value })}
                  placeholder="e.g. Full-stack website development"
                  className={inputCls}
                />
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={it.quantity}
                  onChange={(e) => updateItem(it.id, { quantity: Number(e.target.value) })}
                  className={`${inputCls} text-right`}
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={it.rate}
                  onChange={(e) => updateItem(it.id, { rate: Number(e.target.value) })}
                  className={`${inputCls} text-right`}
                />
                <div className="text-right text-sm font-medium tabular-nums">
                  {formatINR(lineAmount(it))}
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(it.id)}
                  className="rounded p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  title="Remove"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setItems([...items, blankItem()])}
              className="inline-flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:border-primary hover:text-primary"
            >
              <Plus className="h-4 w-4" /> Add service
            </button>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Tax / GST %">
              <input
                type="number"
                min={0}
                step="0.01"
                value={taxPercent}
                onChange={(e) => setTaxPercent(Number(e.target.value))}
                className={inputCls}
              />
            </Field>
            <Field label="Advance received (₹)">
              <input
                type="number"
                min={0}
                step="0.01"
                value={advance}
                onChange={(e) => setAdvance(Number(e.target.value))}
                className={inputCls}
              />
            </Field>
          </div>
        </Section>

        <Section title="Payment & remarks">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Payment mode">
              <input
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                className={inputCls}
                placeholder="UPI / Bank transfer / Cash"
              />
            </Field>
            <Field label="Payment date">
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Payment terms">
              <input
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                className={inputCls}
                placeholder="e.g. Phase 1 advance"
              />
            </Field>
            <Field label="Remarks" className="sm:col-span-2">
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={2}
                className={inputCls}
                placeholder="e.g. Token Advance of Phase 1"
              />
            </Field>
          </div>
        </Section>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-lg font-semibold tracking-tight">Totals</h3>
          <dl className="mt-4 space-y-2 text-sm">
            <Row label="Subtotal" value={formatINR(totals.subtotal)} />
            {taxPercent > 0 && <Row label={`Tax (${taxPercent}%)`} value={formatINR(totals.tax)} />}
            {advance > 0 && <Row label="Advance" value={`- ${formatINR(totals.advance)}`} />}
            <div className="my-2 h-px bg-border" />
            <Row label="Payable" value={formatINR(totals.payable)} highlight />
          </dl>
          <p className="mt-3 text-xs italic text-muted-foreground">
            {rupeesInWords(totals.payable)}
          </p>
        </div>
      </aside>
      </div>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] gap-3 overflow-y-auto p-3 sm:w-[min(95vw,920px)] sm:max-w-none sm:gap-4 sm:p-6">
          <DialogHeader className="text-left">
            <DialogTitle>Live preview</DialogTitle>
            <DialogDescription>
              Same layout as the PDF — updates as you edit.
            </DialogDescription>
          </DialogHeader>
          <div className="invoice-preview-shell overflow-x-auto rounded-lg bg-zinc-100/90 p-1.5 dark:bg-zinc-950/40 sm:p-4">
            <div className="mx-auto w-full min-w-0 max-w-[210mm] shadow-md ring-1 ring-black/10">
              <Suspense fallback={<LoadingDog message="Loading preview…" />}>
                <InvoicePreview invoice={draft} company={company} />
              </Suspense>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <h2 className="mb-4 text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className={highlight ? "text-sm font-semibold text-primary" : "text-muted-foreground"}>
        {label}
      </dt>
      <dd
        className={"tabular-nums " + (highlight ? "text-lg font-bold text-primary" : "font-medium")}
      >
        {value}
      </dd>
    </div>
  );
}
