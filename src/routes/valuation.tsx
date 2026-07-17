import { useEffect, useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  AlertTriangle,
  BadgeIndianRupee,
  BarChart3,
  Building2,
  CircleDollarSign,
  Download,
  FileClock,
  FileSpreadsheet,
  Gauge,
  History,
  Landmark,
  Save,
  Scale,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { ValuationAssumptionsPanel } from "@/components/valuation/ValuationAssumptionsPanel";
import { ValuationHistoryChart } from "@/components/valuation/ValuationHistoryChart";
import { useOperations } from "@/hooks/use-operations";
import { useInvoices } from "@/hooks/use-invoices";
import { loadCompany } from "@/lib/storage";
import { formatINRWhole } from "@/lib/invoice-calc";
import {
  calculateValuation,
  defaultValuationSettings,
  normalizeValuationSettings,
  VALUATION_DISCLAIMER,
  VALUATION_METHOD_LABELS,
  valuationAssumptionsHash,
} from "@/lib/valuation-engine";
import {
  exportValuationCsv,
  exportValuationExcel,
  exportValuationPdf,
} from "@/lib/valuation-export";
import type { ValuationAuditEntry, ValuationSettings, ValuationSnapshot } from "@/lib/types";

export const Route = createFileRoute("/valuation")({
  beforeLoad: async () => {
    const company = await loadCompany();
    if (company.companyValuationEnabled !== true) {
      throw redirect({ to: "/analytics" });
    }
  },
  component: CompanyValuationPage,
});

const actor = "Admin (shared session)";

function makeSnapshot(
  result: ReturnType<typeof calculateValuation>,
  settings: ValuationSettings,
  reason: string,
): ValuationSnapshot {
  return {
    id: `valuation-${crypto.randomUUID().slice(0, 8)}`,
    date: result.asOfDate,
    createdAt: Date.now(),
    calculatedValuation: result.estimatedValuation,
    manualAdjustment: settings.manualValuationAdjustment,
    reason,
    revenue: result.metrics.annualRevenue,
    assets: result.metrics.totalAssets,
    profit: result.metrics.ebitda,
    growth: result.metrics.growthRate,
    netWorth: result.netWorth,
    enterpriseValue: result.enterpriseValue,
    assumptionsHash: valuationAssumptionsHash(settings),
  };
}

function diffSettings(
  before: ValuationSettings,
  after: ValuationSettings,
  reason: string,
): ValuationAuditEntry[] {
  const entries: ValuationAuditEntry[] = [];
  for (const key of Object.keys(after) as (keyof ValuationSettings)[]) {
    if (key === "updatedAt") continue;
    const oldValue = JSON.stringify(before[key]);
    const newValue = JSON.stringify(after[key]);
    if (oldValue === newValue) continue;
    entries.push({
      id: `valuation-audit-${crypto.randomUUID().slice(0, 10)}`,
      timestamp: Date.now(),
      actor,
      reason,
      field: key,
      oldValue,
      newValue,
    });
  }
  return entries;
}

function KpiCard({
  label,
  value,
  hint,
  icon,
  tone = "text-foreground",
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  tone?: string;
}) {
  return (
    <div
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
      title={`${label}: ${hint}`}
    >
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-[11px] font-bold uppercase tracking-wider">{label}</span>
        {icon}
      </div>
      <p className={`mt-3 text-2xl font-extrabold tabular-nums ${tone}`}>{value}</p>
      <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{hint}</p>
    </div>
  );
}

function CompanyValuationPage() {
  const { ops, persist, loading: opsLoading } = useOperations();
  const { invoices, loading: invoicesLoading } = useInvoices();
  const persistedSettings = useMemo(
    () => normalizeValuationSettings(ops.valuationSettings),
    [ops.valuationSettings],
  );
  const [settings, setSettings] = useState<ValuationSettings>(() => defaultValuationSettings());

  useEffect(() => {
    setSettings(persistedSettings);
  }, [persistedSettings]);

  const result = useMemo(
    () => calculateValuation(ops, invoices, settings),
    [ops, invoices, settings],
  );
  const snapshots = useMemo(() => ops.valuationSnapshots ?? [], [ops.valuationSnapshots]);
  const auditEntries = useMemo(() => ops.valuationAudit ?? [], [ops.valuationAudit]);

  useEffect(() => {
    if (opsLoading || invoicesLoading) return;
    const month = result.asOfDate.slice(0, 7);
    if (snapshots.some((snapshot) => snapshot.date.slice(0, 7) === month)) return;
    const snapshot = makeSnapshot(result, settings, "Automatic monthly valuation snapshot");
    persist({ ...ops, valuationSnapshots: [...snapshots, snapshot] });
  }, [invoicesLoading, ops, opsLoading, persist, result, settings, snapshots]);

  const saveSettings = (reason: string) => {
    const normalized = normalizeValuationSettings({ ...settings, updatedAt: Date.now() });
    const changes = diffSettings(persistedSettings, normalized, reason);
    if (changes.length === 0) {
      alert("No valuation assumptions changed.");
      return;
    }
    persist({
      ...ops,
      valuationSettings: normalized,
      valuationAudit: [...auditEntries, ...changes],
    });
  };

  const recordSnapshot = () => {
    const reason = prompt(
      "Reason for this valuation snapshot:",
      "Management valuation review",
    )?.trim();
    if (!reason) return;
    persist({
      ...ops,
      valuationSnapshots: [...snapshots, makeSnapshot(result, settings, reason)],
    });
  };

  if (opsLoading || invoicesLoading) return <OperationsLoading />;

  const confidenceTone =
    result.confidence === "High"
      ? "text-emerald-600"
      : result.confidence === "Medium"
        ? "text-amber-600"
        : "text-rose-600";

  return (
    <div className="space-y-6">
      <OperationsPageHeader
        title="Company Valuation"
        description="Conservative internal management estimate using actual financial performance and audited assumptions."
        action={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={recordSnapshot}>
              <Save className="mr-1.5 h-4 w-4" /> Record snapshot
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => exportValuationPdf(result, settings, snapshots)}
            >
              <Download className="mr-1.5 h-4 w-4" /> PDF
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => exportValuationExcel(result, settings, snapshots)}
            >
              <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => exportValuationCsv(result, settings, snapshots)}
            >
              CSV
            </Button>
          </div>
        }
      />

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
        <strong>Internal estimate only.</strong> {VALUATION_DISCLAIMER}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Estimated Company Valuation"
          value={formatINRWhole(result.estimatedValuation)}
          hint={`Hybrid value after goodwill, startup premium and total ${result.riskDeductionPercent.toFixed(1)}% capped risk deduction`}
          icon={<BadgeIndianRupee className="h-5 w-5 text-primary" />}
          tone="text-primary"
        />
        <KpiCard
          label="Net Worth"
          value={formatINRWhole(result.netWorth)}
          hint="Assets minus liabilities; displayed independently from valuation"
          icon={<Scale className="h-5 w-5 text-violet-500" />}
          tone={result.netWorth >= 0 ? "text-violet-500" : "text-rose-600"}
        />
        <KpiCard
          label="Enterprise Value"
          value={formatINRWhole(result.enterpriseValue)}
          hint="Equity valuation plus loan debt minus ledger cash"
          icon={<Building2 className="h-5 w-5 text-sky-500" />}
          tone="text-sky-500"
        />
        <KpiCard
          label="Valuation Confidence"
          value={result.confidence}
          hint={result.confidenceReasons[0]}
          icon={<ShieldCheck className={`h-5 w-5 ${confidenceTone}`} />}
          tone={confidenceTone}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label="Net Asset Value"
          value={formatINRWhole(result.assetValue)}
          hint="Net asset method"
          icon={<Landmark className="h-4 w-4 text-muted-foreground" />}
        />
        <KpiCard
          label="Goodwill Value"
          value={formatINRWhole(result.goodwillValue)}
          hint={`Score ${result.metrics.goodwillScore.toFixed(0)}/100`}
          icon={<Gauge className="h-4 w-4 text-muted-foreground" />}
        />
        <KpiCard
          label="Revenue Multiple Value"
          value={formatINRWhole(result.revenueMultipleValue)}
          hint={`${settings.revenueMultiple.toFixed(2)}x ${result.annualRevenueBasis} annual revenue`}
          icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
        />
        <KpiCard
          label="EBITDA Value"
          value={formatINRWhole(result.ebitdaValue)}
          hint={`${settings.ebitdaMultiple.toFixed(2)}x normalized EBITDA`}
          icon={<CircleDollarSign className="h-4 w-4 text-muted-foreground" />}
        />
        <KpiCard
          label="Startup Premium"
          value={formatINRWhole(result.startupPremiumValue)}
          hint={
            result.startupPremiumValue > 0
              ? "All ownership, team and recurring-revenue tests passed"
              : "10% applies only when every startup eligibility test passes"
          }
          icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
          tone="text-emerald-600"
        />
        <KpiCard
          label="Risk Deduction"
          value={`-${formatINRWhole(result.riskDeductionValue)}`}
          hint={`${result.riskDeductionPercent.toFixed(1)}% combined deduction; maximum 35%`}
          icon={<AlertTriangle className="h-4 w-4 text-muted-foreground" />}
          tone="text-rose-600"
        />
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="methods">Methods</TabsTrigger>
          <TabsTrigger value="health">Health & Risk</TabsTrigger>
          <TabsTrigger value="explain">Explainability</TabsTrigger>
          <TabsTrigger value="history">History & Audit</TabsTrigger>
          <TabsTrigger value="settings">Admin Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="font-bold">Automatic financial inputs</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  ["Monthly Revenue", result.metrics.monthlyRevenue],
                  ["Annual / TTM Revenue", result.metrics.annualRevenue],
                  ["MRR", result.metrics.mrr],
                  ["ARR", result.metrics.arr],
                  ["Recurring Revenue", result.metrics.recurringRevenue],
                  ["One-Time Revenue", result.metrics.oneTimeRevenue],
                  ["Pending Revenue / AR", result.metrics.pendingRevenue],
                  ["Expected Revenue (Weighted)", result.metrics.expectedRevenue],
                  ["Booked Project Revenue", result.metrics.bookedRevenue],
                  ["Received Revenue", result.metrics.receivedRevenue],
                  ["TTM Expenses", result.metrics.ttmExpenses],
                  ["Normalized EBITDA", result.metrics.ebitda],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="rounded-lg border border-border bg-muted/15 p-3"
                  >
                    <p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p>
                    <p className="mt-1 font-bold tabular-nums">{formatINRWhole(Number(value))}</p>
                  </div>
                ))}
              </div>
            </section>
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="font-bold">Balance sheet bridge</h2>
              <div className="mt-4 space-y-3 text-sm">
                {[
                  ["Ledger Cash", result.metrics.cash],
                  ["Recorded Fixed Assets", result.metrics.fixedAssets],
                  ["Invoice Receivables", result.metrics.receivables],
                  ["Total Assets", result.metrics.totalAssets],
                  ["Total Liabilities", -result.metrics.totalLiabilities],
                  ["Net Worth", result.netWorth],
                ].map(([label, value], index) => (
                  <div
                    key={String(label)}
                    className={`flex justify-between gap-3 ${index >= 3 ? "border-t border-border pt-3 font-bold" : ""}`}
                  >
                    <span className="text-muted-foreground">{label}</span>
                    <span className={Number(value) < 0 ? "text-rose-600" : ""}>
                      {formatINRWhole(Number(value))}
                    </span>
                  </div>
                ))}
              </div>
              {!settings.liabilitiesConfirmed && (
                <div className="mt-4 flex gap-2 rounded-lg border border-rose-500/25 bg-rose-500/5 p-3 text-xs text-rose-600">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Liabilities are not confirmed. Net worth and asset valuation may be overstated.
                </div>
              )}
            </section>
          </div>
        </TabsContent>

        <TabsContent value="methods" className="grid gap-4 lg:grid-cols-2">
          {result.methods.map((method) => (
            <article
              key={method.key}
              className="rounded-xl border border-border bg-card p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold">{VALUATION_METHOD_LABELS[method.key]}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Weight: {settings.weights[method.key]}%
                  </p>
                </div>
                <p className="text-xl font-extrabold tabular-nums text-primary">
                  {formatINRWhole(method.value)}
                </p>
              </div>
              <div className="mt-4 rounded-lg bg-muted/25 p-3">
                <p className="text-[10px] font-bold uppercase text-muted-foreground">Formula</p>
                <p className="mt-1 text-xs font-semibold">{method.formula}</p>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {method.explanation}
              </p>
              <ul className="mt-3 space-y-1 text-[11px] text-muted-foreground">
                {method.assumptions.map((assumption) => (
                  <li key={assumption}>• {assumption}</li>
                ))}
              </ul>
            </article>
          ))}
          <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold">Goodwill</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Score {result.metrics.goodwillScore.toFixed(0)}/100 · Weight{" "}
                  {settings.goodwillWeight}%
                </p>
              </div>
              <p className="text-xl font-extrabold tabular-nums text-primary">
                {formatINRWhole(result.goodwillValue)}
              </p>
            </div>
            <div className="mt-4 rounded-lg bg-muted/25 p-3 text-xs font-semibold">
              Average active valuation × scored goodwill multiplier × weight scaling
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Goodwill is added after the core weighted valuation. Its score is based on brand,
              reputation, repeat clients, partnerships, technology, AI, SaaS, IP, network and
              operational maturity.
            </p>
          </article>
          <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold">Startup Premium</h2>
                <p className="mt-1 text-xs text-muted-foreground">Strict all-or-nothing 10%</p>
              </div>
              <p className="text-xl font-extrabold tabular-nums text-emerald-600">
                {formatINRWhole(result.startupPremiumValue)}
              </p>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Requires own software, source code, domain, brand and GitHub, team size of at least
              three, and recorded recurring revenue. If any test fails, premium is zero.
            </p>
          </article>
          <article className="rounded-xl border border-rose-500/20 bg-card p-5 shadow-sm lg:col-span-2">
            <h2 className="font-bold">Final buyer-value bridge</h2>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-5">
              {[
                ["Weighted Core", result.weightedBeforeAdjustments],
                ["+ Goodwill", result.goodwillValue],
                ["+ Startup Premium", result.startupPremiumValue],
                ["− Risk", -result.riskDeductionValue],
                ["= Final Valuation", result.estimatedValuation],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-lg border border-border p-3">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p>
                  <p
                    className={`mt-1 font-extrabold tabular-nums ${
                      Number(value) < 0 ? "text-rose-600" : "text-foreground"
                    }`}
                  >
                    {formatINRWhole(Number(value))}
                  </p>
                </div>
              ))}
            </div>
          </article>
        </TabsContent>

        <TabsContent value="health" className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold">Startup Health Score</h2>
                  <p className="text-xs text-muted-foreground">
                    Ten factors, each scored out of 10
                  </p>
                </div>
                <span className="text-3xl font-extrabold text-primary">
                  {result.metrics.healthScore.toFixed(0)}
                  <small className="text-sm text-muted-foreground">/100</small>
                </span>
              </div>
              <p className="mt-2 rounded-lg bg-muted/20 p-2 text-xs text-muted-foreground">
                Management health diagnostic only; it does not directly increase the hybrid
                valuation.
              </p>
              <div className="mt-5 space-y-3">
                {Object.entries(result.healthFactors).map(([label, score]) => (
                  <div key={label}>
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold">{label}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {score.toFixed(1)}/10
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${score * 10}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="font-bold">Active valuation risks</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Total risk deduction: {result.riskDeductionPercent.toFixed(1)}%
              </p>
              <div className="mt-4 space-y-2">
                {result.activeRisks.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
                    No configured risk factors are active.
                  </p>
                ) : (
                  result.activeRisks.map((risk) => (
                    <div
                      key={risk.key}
                      className="flex justify-between gap-3 rounded-lg border border-rose-500/20 bg-rose-500/5 p-3 text-xs"
                    >
                      <span>
                        <strong>{risk.label}</strong>
                        <small className="ml-1 text-muted-foreground">
                          ({risk.automatic ? "automatic" : "manual"})
                        </small>
                      </span>
                      <strong className="text-rose-600">-{risk.deduction}%</strong>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </TabsContent>

        <TabsContent value="explain" className="grid gap-5 lg:grid-cols-2">
          {[
            {
              title: "What increased valuation?",
              items: result.increases,
              tone: "border-emerald-500/25",
            },
            {
              title: "What reduced valuation?",
              items: result.reductions,
              tone: "border-rose-500/25",
            },
            {
              title: "Assumptions used",
              items: result.assumptions,
              tone: "border-amber-500/25",
            },
            {
              title: "Missing or incomplete data",
              items: result.missingData,
              tone: "border-sky-500/25",
            },
          ].map((section) => (
            <section
              key={section.title}
              className={`rounded-xl border bg-card p-5 shadow-sm ${section.tone}`}
            >
              <h2 className="font-bold">{section.title}</h2>
              <ul className="mt-4 space-y-2 text-xs leading-relaxed text-muted-foreground">
                {section.items.length === 0 ? (
                  <li>None identified from current data.</li>
                ) : (
                  section.items.map((item) => <li key={item}>• {item}</li>)
                )}
              </ul>
            </section>
          ))}
        </TabsContent>

        <TabsContent value="history" className="space-y-5">
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              <div>
                <h2 className="font-bold">Valuation history</h2>
                <p className="text-xs text-muted-foreground">
                  Monthly valuation, revenue, profit, and net-worth trend
                </p>
              </div>
            </div>
            <div className="mt-4">
              <ValuationHistoryChart snapshots={snapshots} />
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-4">
              <h2 className="flex items-center gap-2 font-bold">
                <FileClock className="h-4 w-4 text-primary" /> Immutable-in-app assumption audit
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Entries are appended and never edited by this module. Actor attribution is limited
                to the shared admin session.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-xs">
                <thead className="bg-muted/50 text-left uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Field</th>
                    <th className="px-4 py-3">Old Value</th>
                    <th className="px-4 py-3">New Value</th>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[...auditEntries]
                    .sort((a, b) => b.timestamp - a.timestamp)
                    .map((entry) => (
                      <tr key={entry.id}>
                        <td className="whitespace-nowrap px-4 py-3">
                          {new Date(entry.timestamp).toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-3 font-semibold">{entry.field}</td>
                        <td className="max-w-48 truncate px-4 py-3 text-muted-foreground">
                          {entry.oldValue}
                        </td>
                        <td className="max-w-48 truncate px-4 py-3">{entry.newValue}</td>
                        <td className="px-4 py-3">{entry.actor}</td>
                        <td className="px-4 py-3">{entry.reason}</td>
                      </tr>
                    ))}
                  {auditEntries.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                        No manual valuation changes have been saved.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="settings">
          <ValuationAssumptionsPanel
            settings={settings}
            onChange={setSettings}
            onSave={saveSettings}
          />
        </TabsContent>
      </Tabs>

      <footer className="rounded-xl border border-border bg-muted/15 p-4 text-[11px] leading-relaxed text-muted-foreground">
        {VALUATION_DISCLAIMER}
      </footer>
    </div>
  );
}
