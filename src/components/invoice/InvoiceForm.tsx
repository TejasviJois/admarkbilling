import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Plus, Save, Trash2, Eye } from "lucide-react";
import { logClientError } from "@/lib/client-logger";
import { upsertInvoice } from "@/lib/storage";
import { nextInvoiceNumberFromList } from "@/lib/invoice-number";
import { computeTotals, deriveInvoiceStatus, formatINR, lineAmount } from "@/lib/invoice-calc";
import { resolveRelatedProject } from "@/lib/invoice-project-link";
import { rupeesInWords } from "@/lib/number-to-words";
import type { Invoice, LineItem } from "@/lib/types";
import { KNOWN_CLIENT_NAMES } from "@/lib/client-directory";
import { BUSINESS_TYPE_OPTIONS } from "@/lib/business-type-options";
import { autoFillBusinessTypeForClientName } from "@/lib/client-business-autofill";
import { KNOWN_CONTACT_PERSON_NAMES } from "@/lib/contact-person-directory";
import { useCompany } from "@/hooks/use-company";
import { useInvoices } from "@/hooks/use-invoices";
import { useOperations } from "@/hooks/use-operations";
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
  existing?: Invoice;
  onSaved?: (inv: Invoice) => void;
}

export default function InvoiceForm({ existing, onSaved }: Props) {
  const queryClient = useQueryClient();
  const { company } = useCompany();
  const { invoices } = useInvoices();
  const isEdit = Boolean(existing);
  const [number, setNumber] = useState(existing?.number ?? "");
  const [date, setDate] = useState(existing?.date ?? todayIso());
  const { ops } = useOperations();
  const [clientId, setClientId] = useState(existing?.clientId ?? "");
  const [clientName, setClientName] = useState(existing?.clientName ?? "");
  const [clientBusinessType, setClientBusinessType] = useState(existing?.clientBusinessType ?? "");
  const [clientAddress, setClientAddress] = useState(existing?.clientAddress ?? "");
  const [clientContact, setClientContact] = useState(existing?.clientContact ?? "");
  const [clientPhone, setClientPhone] = useState(existing?.clientPhone ?? "");
  const [clientEmail, setClientEmail] = useState(existing?.clientEmail ?? "");
  const [clientGstin, setClientGstin] = useState(existing?.clientGstin ?? "");
  const [items, setItems] = useState<LineItem[]>(
    existing?.items?.length ? existing.items : [blankItem()],
  );
  const [advance, setAdvance] = useState(existing?.advance ?? 0);
  const [taxPercent, setTaxPercent] = useState(existing?.taxPercent ?? 0);
  const [remarks, setRemarks] = useState(existing?.remarks ?? company.remarks ?? "");
  const [paymentTerms, setPaymentTerms] = useState(
    existing?.paymentTerms ?? company.paymentTerms ?? "",
  );
  const [paymentMode, setPaymentMode] = useState(existing?.paymentMode ?? company.paymentMode ?? "");
  const [paymentDate, setPaymentDate] = useState(existing?.paymentDate ?? "");
  const [status, setStatus] = useState<Invoice["status"]>(existing?.status ?? "generated");
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (isEdit) return;
    setNumber(nextInvoiceNumberFromList(invoices, date));
  }, [date, invoices, isEdit]);

  /** When client / company name matches partner or client sheet, fill Type of business */
  useEffect(() => {
    if (isEdit) return;
    const next = autoFillBusinessTypeForClientName(clientName);
    if (next !== undefined) {
      setClientBusinessType(next);
    }
  }, [clientName, isEdit]);

  const updateItem = (id: string, patch: Partial<LineItem>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const removeItem = (id: string) =>
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((it) => it.id !== id)));

  const draft: Invoice = useMemo(
    () => ({
      id: existing?.id ?? "draft",
      number,
      date,
      clientId: clientId || undefined,
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
      createdAt: existing?.createdAt ?? Date.now(),
      projectId: existing?.projectId,
      agreementId: existing?.agreementId,
      organizationId: existing?.organizationId,
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
      clientId,
      existing,
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
    const assignedNumber = existing?.number ?? nextInvoiceNumberFromList(invoices, date);
    const baseInvoice: Invoice = {
      ...draft,
      id: existing?.id ?? uid(),
      number: assignedNumber,
      createdAt: existing?.createdAt ?? Date.now(),
    };
    const relatedProject = resolveRelatedProject(ops.projects, baseInvoice);
    const inv: Invoice = { ...baseInvoice, projectId: relatedProject?.id ?? existing?.projectId };
    try {
      const saved = await upsertInvoice(inv);
      const nextList = [saved, ...invoices.filter((i) => i.id !== saved.id)];
      queryClient.setQueryData(queryKeys.invoices, nextList);
      writeClientCache("invoices", nextList);
      then?.(saved);
      onSaved?.(saved);
      if (!isEdit) setNumber(nextInvoiceNumberFromList(nextList, date));
    } catch (e) {
      logClientError("invoiceForm.persist", e);
      alert(e instanceof Error ? e.message : "Could not save invoice.");
    }
  };

  const handleGenerate = () => {
    void persistInvoice(async (inv) => {
      const { downloadInvoicePdf } = await import("@/lib/pdf");
      // Print the money-derived status (e.g. partially_paid when an advance
      // was recorded) so the PDF matches the invoice page.
      const printable = { ...inv, status: deriveInvoiceStatus(inv, ops.payments ?? []) };
      await downloadInvoicePdf(printable, company);
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 border-b border-border/80 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            to="/invoices"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Invoices
          </Link>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {isEdit ? `Edit ${existing?.number}` : "New invoice"}
          </h1>
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
            {isEdit
              ? "Changes save to this invoice number."
              : "Number is assigned automatically for the financial year."}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={handleGenerate}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Save className="h-3.5 w-3.5" />
            Download
          </button>
          <button
            type="button"
            onClick={() => void persistInvoice()}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/80 px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted/40"
          >
            {isEdit ? "Save" : "Save only"}
          </button>
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/80 px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted/40"
          >
            <Eye className="h-3.5 w-3.5" />
            Preview
          </button>
        </div>
      </div>

      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(240px,18rem)]">
        <div className="min-w-0 space-y-8">
          <Section title="Invoice info">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Invoice number">
                <input
                  value={number}
                  readOnly
                  aria-readonly="true"
                  className={`${inputCls} cursor-default bg-muted/30 text-foreground`}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {isEdit ? "Original number kept." : "Auto-sequenced (e.g. AM/26-27/0001)."}
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
                  <option value="generated">Generated (unpaid)</option>
                  <option value="sent">Sent to client</option>
                  <option value="paid">Paid</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </Field>
            </div>
          </Section>

          <Section title="Bill to">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Select client" className="sm:col-span-2">
                <select
                  className={inputCls}
                  value={clientId}
                  onChange={(e) => {
                    const cid = e.target.value;
                    setClientId(cid);
                    const found = (ops.clients ?? []).find((c) => c.id === cid);
                    if (found) {
                      setClientName(found.companyName);
                      setClientContact(found.contactPerson);
                      setClientPhone(found.phone);
                      setClientEmail(found.email);
                      setClientAddress(found.billingAddress);
                      setClientGstin(found.gstNumber ?? "");
                      setClientBusinessType(found.industry ?? "");
                    } else {
                      setClientName("");
                      setClientContact("");
                      setClientPhone("");
                      setClientEmail("");
                      setClientAddress("");
                      setClientGstin("");
                      setClientBusinessType("");
                    }
                  }}
                >
                  <option value="">Select a saved client…</option>
                  {(ops.clients ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.companyName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Client / company name">
                <input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Type of business">
                <input
                  value={clientBusinessType}
                  onChange={(e) => setClientBusinessType(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Contact person">
                <input
                  value={clientContact}
                  onChange={(e) => setClientContact(e.target.value)}
                  className={inputCls}
                />
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
              <Field label="GSTIN / company no.">
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
              <div className="hidden grid-cols-[1fr_80px_120px_120px_40px] gap-3 text-xs text-muted-foreground sm:grid">
                <div>Description</div>
                <div className="text-right">Qty</div>
                <div className="text-right">Rate (₹)</div>
                <div className="text-right">Amount</div>
                <div />
              </div>
              {items.map((it) => (
                <div
                  key={it.id}
                  className="grid grid-cols-1 gap-3 border-b border-border/60 py-3 last:border-b-0 sm:grid-cols-[1fr_80px_120px_120px_40px] sm:items-center sm:border-0 sm:py-0"
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
                    className="rounded-md p-2 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-400"
                    title="Remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setItems([...items, blankItem()])}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                Add service
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

        <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          <h3 className="text-sm font-medium text-foreground">Totals</h3>
          <dl className="divide-y divide-border/80 border-y border-border/80 text-sm">
            <Row label="Subtotal" value={formatINR(totals.subtotal)} />
            {taxPercent > 0 && (
              <Row label={`Tax (${taxPercent}%)`} value={formatINR(totals.tax)} />
            )}
            {advance > 0 && <Row label="Advance" value={`− ${formatINR(totals.advance)}`} />}
            <Row label="Payable" value={formatINR(totals.payable)} highlight />
          </dl>
          <p className="text-xs text-muted-foreground">{rupeesInWords(totals.payable)}</p>
        </aside>
      </div>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] gap-3 overflow-y-auto p-3 sm:w-[min(95vw,920px)] sm:max-w-none sm:gap-4 sm:p-6">
          <DialogHeader className="text-left">
            <DialogTitle>Preview</DialogTitle>
            <DialogDescription>Same layout as the PDF — updates as you edit.</DialogDescription>
          </DialogHeader>
          <div className="invoice-preview-shell rounded-lg bg-zinc-100/90 p-1.5 dark:bg-zinc-950/40 sm:p-4">
            <Suspense fallback={<LoadingDog message="Loading preview…" />}>
              <InvoicePreview invoice={draft} company={company} />
            </Suspense>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-border/80 bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-medium tracking-tight text-foreground">{title}</h2>
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
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
      <dt className={highlight ? "font-medium text-foreground" : "text-muted-foreground"}>
        {label}
      </dt>
      <dd
        className={
          "tabular-nums " + (highlight ? "text-base font-semibold text-foreground" : "font-medium")
        }
      >
        {value}
      </dd>
    </div>
  );
}
