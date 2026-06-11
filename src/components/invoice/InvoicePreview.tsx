import type { CompanySettings, Invoice } from "@/lib/types";

import { DEFAULT_LETTERHEAD_URL } from "@/lib/constants";

import { computeTotals, formatINR, lineAmount } from "@/lib/invoice-calc";

import { rupeesInWords } from "@/lib/number-to-words";

import { statusBadgeClassLight, statusIndicatorEmoji } from "@/lib/invoice-status";

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



export default function InvoicePreview({ invoice, company }: Props) {

  const totals = computeTotals(invoice);



  return (

    <div

      className="invoice-receipt-surface relative mx-auto aspect-[210/297] w-full max-w-3xl overflow-hidden rounded-xl border border-border bg-white text-ink shadow-sm"

      style={{

        backgroundImage: `url(${DEFAULT_LETTERHEAD_URL})`,

        backgroundSize: "100% 100%",

        backgroundRepeat: "no-repeat",

        backgroundPosition: "center top",

      }}

    >

      <div className="relative z-10 flex min-h-full flex-col px-10 pb-[7.5rem] pt-[11.5rem] sm:px-12">

        <div className="mb-6 flex items-start justify-end text-right">

          <div>

            <p className="text-3xl font-black leading-none tracking-tight text-brand">INVOICE</p>

            <p className="mt-3 text-base font-bold tabular-nums text-foreground">{invoice.number}</p>

            <p className="mt-1 text-xs font-medium text-muted-foreground">

              Date: {formatDate(invoice.date)}

            </p>

          </div>

        </div>



        <div className="grid gap-8 pb-4 sm:grid-cols-2">

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

                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide",

                      statusBadgeClassLight(invoice.status),

                    )}

                  >

                    <span className="select-none text-sm leading-none" aria-hidden>

                      {statusIndicatorEmoji(invoice.status)}

                    </span>

                    {invoice.status.toUpperCase()}

                  </span>

                </dd>

              </div>

            </dl>

          </div>

        </div>



        <div className="mt-6 space-y-8">

          <table className="w-full overflow-hidden rounded-md text-sm">

            <thead className="bg-ink text-xs uppercase tracking-wider text-white">

              <tr>

                <th className="px-3 py-3 text-center">#</th>

                <th className="px-3 py-3 text-left">Description</th>

                <th className="px-3 py-3 text-center">Qty</th>

                <th className="px-3 py-3 text-center">Rate</th>

                <th className="px-3 py-3 text-right">Amount</th>

              </tr>

            </thead>

            <tbody>

              {invoice.items.map((it, i) => (

                <tr key={it.id} className="border-b border-border/70 bg-white/90">

                  <td className="px-3 py-3 text-center text-muted-foreground tabular-nums">{i + 1}</td>

                  <td className="px-3 py-3">{it.description || "—"}</td>

                  <td className="px-3 py-3 text-center tabular-nums">{it.quantity || 0}</td>

                  <td className="px-3 py-3 text-center tabular-nums">{formatINR(it.rate || 0)}</td>

                  <td className="px-3 py-3 text-right font-medium tabular-nums">

                    {formatINR(lineAmount(it))}

                  </td>

                </tr>

              ))}

            </tbody>

          </table>



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

              <div className="rounded-xl border-2 border-brand/40 bg-gradient-to-br from-brand/[0.14] via-brand/[0.07] to-transparent px-5 py-5 shadow-md ring-1 ring-black/[0.06]">

                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand">

                  Amount Payable

                </p>

                <p className="mt-2 text-3xl font-extrabold tabular-nums leading-none tracking-tight text-brand md:text-[2.125rem]">

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



        <div className="mt-auto grid gap-8 pt-8 sm:grid-cols-2">

          <div>

            <p className="text-xs font-semibold uppercase tracking-widest text-brand">Bank Details</p>

            <div className="mt-3 space-y-1.5 rounded-lg border border-border/80 bg-white/95 px-4 py-4 text-xs leading-relaxed">

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

          <div className="text-right sm:pt-6">

            {company.signatureDataUrl && (

              <img

                src={company.signatureDataUrl}

                alt="Signature"

                className="ml-auto max-h-24 w-auto max-w-[220px] object-contain object-right"

              />

            )}

            <div className="ml-auto mt-3 max-w-[200px] border-t border-ink pt-2 text-xs">

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

