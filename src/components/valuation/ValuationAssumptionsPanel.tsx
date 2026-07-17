import { useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { VALUATION_METHOD_LABELS, VALUATION_RISK_LABELS } from "@/lib/valuation-engine";
import type { ValuationMethodKey, ValuationRiskKey, ValuationSettings } from "@/lib/types";

const methodKeys: ValuationMethodKey[] = ["asset", "revenue", "ebitda"];
const riskKeys = Object.keys(VALUATION_RISK_LABELS) as ValuationRiskKey[];

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <label className="space-y-1.5 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      <div className="relative">
        <Input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value) || 0)}
          className={suffix ? "pr-10" : undefined}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}

function ScoreSlider({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs">
        <span className="font-semibold text-muted-foreground">{label}</span>
        <span className="font-bold tabular-nums text-foreground">
          {value}/{max}
        </span>
      </div>
      <Slider
        min={0}
        max={max}
        step={1}
        value={[value]}
        onValueChange={([next]) => onChange(next)}
      />
    </div>
  );
}

export function ValuationAssumptionsPanel({
  settings,
  onChange,
  onSave,
}: {
  settings: ValuationSettings;
  onChange: (settings: ValuationSettings) => void;
  onSave: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  const patch = (next: Partial<ValuationSettings>) =>
    onChange({ ...settings, ...next, updatedAt: Date.now() });

  const save = () => {
    if (!reason.trim()) {
      alert("An audit reason is required before saving valuation assumptions.");
      return;
    }
    onSave(reason.trim());
    setReason("");
  };

  return (
    <div className="space-y-5">
      <details open className="rounded-xl border border-border bg-card">
        <summary className="cursor-pointer px-5 py-4 text-sm font-bold">Market assumptions</summary>
        <div className="grid gap-4 border-t border-border p-5 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1.5 text-xs font-semibold text-muted-foreground">
            <span>Business Type</span>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
              value={settings.businessType}
              onChange={(event) => {
                const businessType = event.target.value as ValuationSettings["businessType"];
                const revenueMultiple =
                  businessType === "service" ? 1.5 : businessType === "software" ? 3 : 2.5;
                patch({ businessType, revenueMultiple });
              }}
            >
              <option value="service">Service Company — default 1.5x</option>
              <option value="software">Software Company — default 3.0x</option>
              <option value="mixed">Mixed Business — default 2.5x</option>
            </select>
          </label>
          <NumberField
            label="Revenue Multiple (editable override)"
            value={settings.revenueMultiple}
            min={0}
            max={20}
            step={0.1}
            suffix="x"
            onChange={(revenueMultiple) => patch({ revenueMultiple })}
          />
          <NumberField
            label="Industry EBITDA Multiple"
            value={settings.ebitdaMultiple}
            min={0}
            max={30}
            step={0.1}
            suffix="x"
            onChange={(ebitdaMultiple) => patch({ ebitdaMultiple })}
          />
          <NumberField
            label="Largest Customer Concentration"
            value={settings.customerConcentrationOverride ?? 0}
            min={0}
            max={100}
            suffix="%"
            onChange={(customerConcentrationOverride) => patch({ customerConcentrationOverride })}
          />
          <div className="space-y-2 sm:col-span-2 lg:col-span-3">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-muted-foreground">Founder Dependency</span>
              <span className="font-bold text-foreground">{settings.founderDependency}%</span>
            </div>
            <Slider
              min={0}
              max={100}
              step={25}
              value={[settings.founderDependency]}
              onValueChange={([founderDependency]) => patch({ founderDependency })}
            />
            <p className="text-[11px] text-muted-foreground">
              100% means the business depends entirely on founders and receives the maximum founder
              deduction.
            </p>
          </div>
        </div>
      </details>

      <details className="rounded-xl border border-border bg-card">
        <summary className="cursor-pointer px-5 py-4 text-sm font-bold">
          Hybrid method weights
        </summary>
        <div className="space-y-5 border-t border-border p-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {methodKeys.map((key) => (
              <NumberField
                key={key}
                label={`${VALUATION_METHOD_LABELS[key]} Weight`}
                value={settings.weights[key]}
                min={0}
                max={100}
                suffix="%"
                onChange={(value) => patch({ weights: { ...settings.weights, [key]: value } })}
              />
            ))}
            <NumberField
              label="Goodwill Weight"
              value={settings.goodwillWeight}
              min={0}
              max={30}
              suffix="%"
              onChange={(goodwillWeight) => patch({ goodwillWeight })}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Weights are normalized across active methods. If EBITDA is non-positive, its 20% weight
            is automatically redistributed to Net Asset Value and Revenue Valuation.
          </p>
        </div>
      </details>

      <details className="rounded-xl border border-border bg-card">
        <summary className="cursor-pointer px-5 py-4 text-sm font-bold">
          Assets & liabilities
        </summary>
        <div className="space-y-5 border-t border-border p-5">
          <p className="text-xs text-muted-foreground">
            Enter only balances not already recorded in Assets or the cash ledger. Liabilities are
            manual because the ERP currently has no complete balance-sheet liability ledger.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(settings.manualAssets) as (keyof typeof settings.manualAssets)[]).map(
              (key) => (
                <NumberField
                  key={key}
                  label={`Additional ${key.replace(/([A-Z])/g, " $1")}`}
                  value={settings.manualAssets[key]}
                  min={0}
                  suffix="₹"
                  onChange={(value) =>
                    patch({ manualAssets: { ...settings.manualAssets, [key]: value } })
                  }
                />
              ),
            )}
            {(Object.keys(settings.liabilities) as (keyof typeof settings.liabilities)[]).map(
              (key) => (
                <NumberField
                  key={key}
                  label={key.replace(/([A-Z])/g, " $1")}
                  value={settings.liabilities[key]}
                  min={0}
                  suffix="₹"
                  onChange={(value) =>
                    patch({ liabilities: { ...settings.liabilities, [key]: value } })
                  }
                />
              ),
            )}
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm font-semibold">
            <input
              type="checkbox"
              checked={settings.liabilitiesConfirmed}
              onChange={(event) => patch({ liabilitiesConfirmed: event.target.checked })}
            />
            I confirm the liability balances are complete as of today
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm font-semibold">
            <input
              type="checkbox"
              checked={settings.financialStatementsComplete}
              onChange={(event) => patch({ financialStatementsComplete: event.target.checked })}
            />
            Financial statements are complete and reconciled
          </label>
        </div>
      </details>

      <details className="rounded-xl border border-border bg-card">
        <summary className="cursor-pointer px-5 py-4 text-sm font-bold">
          Startup premium eligibility
        </summary>
        <div className="space-y-4 border-t border-border p-5">
          <p className="text-xs text-muted-foreground">
            The 10% premium applies only when every ownership condition is confirmed, team size is
            at least three, and recurring revenue exists in project billing.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["ownSoftware", "Own Software"],
                ["ownSourceCode", "Own Source Code"],
                ["ownDomain", "Own Domain"],
                ["ownBrand", "Own Brand"],
                ["ownGithub", "Own GitHub"],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm font-semibold"
              >
                <input
                  type="checkbox"
                  checked={settings.startupPremiumCriteria[key]}
                  onChange={(event) =>
                    patch({
                      startupPremiumCriteria: {
                        ...settings.startupPremiumCriteria,
                        [key]: event.target.checked,
                      },
                    })
                  }
                />
                {label}
              </label>
            ))}
          </div>
          <NumberField
            label="Current Team Size"
            value={settings.startupPremiumCriteria.teamSize}
            min={0}
            onChange={(teamSize) =>
              patch({
                startupPremiumCriteria: { ...settings.startupPremiumCriteria, teamSize },
              })
            }
          />
        </div>
      </details>

      <details className="rounded-xl border border-border bg-card">
        <summary className="cursor-pointer px-5 py-4 text-sm font-bold">
          Goodwill score (0–100)
        </summary>
        <div className="grid gap-5 border-t border-border p-5 sm:grid-cols-2">
          {(Object.keys(settings.goodwillScores) as (keyof typeof settings.goodwillScores)[]).map(
            (key) => (
              <ScoreSlider
                key={key}
                label={key.replace(/([A-Z])/g, " $1")}
                value={settings.goodwillScores[key]}
                max={10}
                onChange={(value) =>
                  patch({ goodwillScores: { ...settings.goodwillScores, [key]: value } })
                }
              />
            ),
          )}
          <NumberField
            label="Manual Goodwill Adjustment"
            value={settings.goodwillManualAdjustment}
            step={1000}
            suffix="₹"
            onChange={(goodwillManualAdjustment) => patch({ goodwillManualAdjustment })}
          />
        </div>
      </details>

      <details className="rounded-xl border border-border bg-card">
        <summary className="cursor-pointer px-5 py-4 text-sm font-bold">Risk deductions</summary>
        <div className="space-y-3 border-t border-border p-5">
          {riskKeys.map((key) => (
            <div
              key={key}
              className="grid items-center gap-3 rounded-lg border border-border p-3 sm:grid-cols-[1fr_120px]"
            >
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={settings.riskEnabled[key]}
                  onChange={(event) =>
                    patch({
                      riskEnabled: { ...settings.riskEnabled, [key]: event.target.checked },
                    })
                  }
                />
                {VALUATION_RISK_LABELS[key]}
              </label>
              <NumberField
                label="Deduction"
                value={settings.riskDeductions[key]}
                min={0}
                max={key === "singleFounder" ? 20 : key === "heavyDebt" ? 5 : 10}
                suffix="%"
                onChange={(value) =>
                  patch({ riskDeductions: { ...settings.riskDeductions, [key]: value } })
                }
              />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Founder and customer deductions scale with their actual percentages. Debt scales with
            the debt-to-assets ratio. Combined deductions are capped at 35%.
          </p>
        </div>
      </details>

      <details className="rounded-xl border border-border bg-card">
        <summary className="cursor-pointer px-5 py-4 text-sm font-bold">
          Manual health scores & adjustments
        </summary>
        <div className="grid gap-5 border-t border-border p-5 sm:grid-cols-2">
          {(
            Object.keys(settings.healthManualScores) as (keyof typeof settings.healthManualScores)[]
          ).map((key) => (
            <ScoreSlider
              key={key}
              label={key.replace(/([A-Z])/g, " $1")}
              value={settings.healthManualScores[key]}
              max={10}
              onChange={(value) =>
                patch({
                  healthManualScores: { ...settings.healthManualScores, [key]: value },
                })
              }
            />
          ))}
          <NumberField
            label="Final Manual Valuation Adjustment"
            value={settings.manualValuationAdjustment}
            step={1000}
            suffix="₹"
            onChange={(manualValuationAdjustment) => patch({ manualValuationAdjustment })}
          />
        </div>
      </details>

      <div className="sticky bottom-3 rounded-xl border border-primary/25 bg-card/95 p-4 shadow-xl backdrop-blur">
        <label className="space-y-1.5 text-xs font-semibold text-muted-foreground">
          <span>Reason for manual changes (required for audit trail)</span>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explain the evidence or management judgement supporting these assumptions."
            rows={2}
          />
        </label>
        <Button type="button" className="mt-3 w-full gap-2" onClick={save}>
          <Save className="h-4 w-4" /> Save assumptions with audit record
        </Button>
      </div>
    </div>
  );
}
