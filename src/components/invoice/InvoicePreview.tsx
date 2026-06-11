import type { CompanySettings, Invoice } from "@/lib/types";
import { DEFAULT_LETTERHEAD_URL } from "@/lib/constants";
import { computeTotals, formatINR, lineAmount } from "@/lib/invoice-calc";
import { rupeesInWords } from "@/lib/number-to-words";
import { statusTextClassLight } from "@/lib/invoice-status";
import { cn } from "@/lib/utils";

interface Props {
  invoice: Invoice;
  company: CompanySettings;
}

function formatDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const letterheadStyle = {
  backgroundImage: `url(${DEFAULT_LETTERHEAD_URL})`,
  backgroundSize: "100% 100%",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "center top",
} as const;

export default function InvoicePreview({ invoice, company }: Props) {
  const totals = computeTotals(invoice);

  return (
    <div
      className="invoice-receipt-surface relative mx-auto w-full max-w-3xl rounded-xl border border-border bg-white text-ink shadow-sm sm:min-h-[297mm]"
      style={letterheadStyle}
    >
      <div className="relative z-10 flex flex-col px-4 pb-20 pt-36 sm:min-h-[297mm] sm:px-10 sm:pb-[7.5rem] sm:pt-[11.5rem] lg:px-12">
        <div className="mb-4 text-left sm:mb-6">
          <p className="text-2xl font-black leading-none tracking-tight text-brand sm:text-3xl">INVOICE</p>
          <p className="mt-2 text-sm font-bold tabular-nums text-foreground sm:mt-3 sm:text-base">
            {invoice.number}
          </p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            Date: {formatDate(invoice.date)}
          </p>
        </div>

        <div className="grid gap-5 pb-2 sm:grid-cols-2 sm:gap-8 sm:pb-4">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-brand">Bill To</p>
            <p className="text-base font-bold leading-snug">{invoice.clientName || "—"}</p>
            {invoice.clientBusinessType && (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground/80">Type of business:</span>{" "}
                {invoice.clientBusinessType}
              </p>
            )}
            <div className="space-y-1 text-xs leading-relaxed text-muted-foreground">
              {[
                invoice.clientAddress,
                invoice.clientContact,
                invoice.clientPhone,
                invoice.clientEmail,
                invoice.clientGstin && `GSTIN: ${invoice.clientGstin}`,
              ]
                .filter(Boolean)
                .map((l, i) => (
                  <p key={i}>{l as string}</p>
                ))}
            </div>
          </div>

          <div className="text-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-brand">Details</p>
            <dl className="mt-3 space-y-2 text-xs">
              <Meta k="Invoice No." v={invoice.number} />
              <Meta k="Date" v={formatDate(invoice.date)} />
              {invoice.paymentMode && <Meta k="Payment Mode" v={invoice.paymentMode} />}
              {invoice.paymentDate && <Meta k="Payment Date" v={formatDate(invoice.paymentDate)} />}
              {invoice.paymentTerms && <Meta k="Terms" v={invoice.paymentTerms} />}
              <div className="flex justify-between gap-3 pt-0.5">
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <span
                    className={cn(
                      "text-xs font-semibold uppercase tracking-wide",
                      statusTextClassLight(invoice.status),
                    )}
                  >
                    {invoice.status}
                  </span>
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="mt-4 space-y-6 sm:mt-6 sm:space-y-8">
          <div className="-mx-1 overflow-x-auto px-1 sm:mx-0 sm:overflow-visible sm:px-0">
            <table className="invoice-line-items w-full min-w-[28rem] overflow-hidden rounded-md text-xs sm:min-w-0 sm:text-sm">
              <thead>
                <tr>
                  <th className="px-2 py-2 text-center sm:px-3 sm:py-3">#</th>
                  <th className="px-2 py-2 text-left sm:px-3 sm:py-3">Description</th>
                  <th className="px-2 py-2 text-center sm:px-3 sm:py-3">Qty</th>
                  <th className="px-2 py-2 text-center sm:px-3 sm:py-3">Rate</th>
                  <th className="px-2 py-2 text-right sm:px-3 sm:py-3">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((it, i) => (
                  <tr key={it.id} className="border-b border-border/70 bg-white/90">
                    <td className="px-2 py-2 text-center tabular-nums text-muted-foreground sm:px-3 sm:py-3">
                      {i + 1}
                    </td>
                    <td className="px-2 py-2 sm:px-3 sm:py-3">{it.description || "—"}</td>
                    <td className="px-2 py-2 text-center tabular-nums sm:px-3 sm:py-3">
                      {it.quantity || 0}
                    </td>
                    <td className="px-2 py-2 text-center tabular-nums sm:px-3 sm:py-3">
                      {formatINR(it.rate || 0)}
                    </td>
                    <td className="px-2 py-2 text-right font-medium tabular-nums sm:px-3 sm:py-3">
                      {formatINR(lineAmount(it))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <div className="w-full max-w-sm space-y-1.5">
              <dl className="space-y-1.5">
                <Total k="Subtotal" v={formatINR(totals.subtotal)} muted />
                {totals.tax > 0 && (
                  <Total k={`Tax (${invoice.taxPercent}%)`} v={formatINR(totals.tax)} muted />
                )}
                {totals.advance > 0 && (
                  <Total k="Advance Received" v={`- ${formatINR(totals.advance)}`} muted />
                )}
              </dl>
              <div className="my-4 h-px bg-border" />
              <div className="rounded-xl border-2 border-brand/40 bg-gradient-to-br from-brand/[0.14] via-brand/[0.07] to-transparent px-4 py-4 shadow-md ring-1 ring-black/[0.06] sm:px-5 sm:py-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand">
                  Amount Payable
                </p>
                <p className="mt-2 text-2xl font-extrabold tabular-nums leading-none tracking-tight text-brand sm:text-3xl md:text-[2.125rem]">
                  {formatINR(totals.payable)}
                </p>
              </div>
            </div>
          </div>

          <p className="text-xs italic leading-relaxed text-muted-foreground">
            Amount in words: {rupeesInWords(totals.payable)}
          </p>

          {invoice.remarks && (
            <div className="rounded-md border border-border bg-white/90 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Remarks
              </p>
              <p className="mt-2 text-sm leading-relaxed">{invoice.remarks}</p>
            </div>
          )}
        </div>

        <div className="invoice-page-footer mt-6 grid grid-cols-1 gap-5 pt-2 sm:grid-cols-2 sm:gap-6 sm:pt-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-brand">Bank Details</p>
            <div className="mt-2 space-y-1.5 rounded-lg border border-border/80 bg-white/95 px-3 py-3 text-xs leading-relaxed sm:mt-3 sm:px-4 sm:py-4">
              {company.accountName && (
                <p>
                  <span className="text-muted-foreground">Account Name:</span>{" "}
                  <span className="font-medium text-foreground">{company.accountName}</span>
                </p>
              )}
              {company.bankName && (
                <p>
                  <span className="text-muted-foreground">Bank:</span>{" "}
                  <span className="font-medium text-foreground">{company.bankName}</span>
                </p>
              )}
              {company.accountNumber && (
                <p>
                  <span className="text-muted-foreground">A/C Number:</span>{" "}
                  <span className="font-medium text-foreground">{company.accountNumber}</span>
                </p>
              )}
              {company.ifsc && (
                <p>
                  <span className="text-muted-foreground">IFSC:</span>{" "}
                  <span className="font-medium text-foreground">{company.ifsc}</span>
                </p>
              )}
              {company.branch && (
                <p>
                  <span className="text-muted-foreground">Branch:</span>{" "}
                  <span className="font-medium text-foreground">{company.branch}</span>
                </p>
              )}
              {company.upi && (
                <p>
                  <span className="text-muted-foreground">UPI:</span>{" "}
                  <span className="font-medium text-foreground">{company.upi}</span>
                </p>
              )}
            </div>
          </div>

          <div className="pt-2 text-left sm:pt-[45px] sm:text-right">
            {company.signatureDataUrl && (
              <img
                src={company.signatureDataUrl}
                alt="Signature"
                className="max-h-20 w-auto max-w-[220px] object-contain object-left sm:ml-auto sm:object-right"
              />
            )}
            <div className="mt-3 max-w-[200px] border-t border-[#121212] pt-2 text-xs sm:ml-auto">
              <p className="font-semibold">For {company.name}</p>
              <p className="text-muted-foreground">{company.authorizedName || "Authorized Signatory"}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}

function Total({ k, v, muted }: { k: string; v: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt
        className={cn(
          "text-sm",
          muted ? "font-normal text-muted-foreground" : "font-medium text-muted-foreground",
        )}
      >
        {k}
      </dt>
      <dd
        className={cn(
          "tabular-nums",
          muted ? "text-sm font-medium text-muted-foreground" : "text-sm font-semibold text-foreground",
        )}
      >
        {v}
      </dd>
    </div>
  );
}
