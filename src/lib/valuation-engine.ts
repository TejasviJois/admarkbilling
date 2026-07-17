import { calculateInvoicePayments, computeTotals } from "./invoice-calc";
import { isFounderSalary } from "./founder-ledger";
import { sumActiveMrr, sumPipelineBookedRevenue } from "./project-billing";
import type {
  Invoice,
  OperationsData,
  ValuationMethodKey,
  ValuationRiskKey,
  ValuationSettings,
} from "./types";

export const VALUATION_DISCLAIMER =
  "This valuation is an internal management estimate generated using company financials and configurable assumptions. It should not be treated as an official investment valuation, statutory audit report, or certified business valuation.";

export const VALUATION_METHOD_LABELS: Record<ValuationMethodKey, string> = {
  asset: "Net Asset Value",
  revenue: "Revenue Multiple",
  ebitda: "EBITDA Multiple",
  dcf: "Discounted Cash Flow",
  startupScore: "Startup Scorecard",
  goodwill: "Goodwill & Intangibles",
};

export const VALUATION_RISK_LABELS: Record<ValuationRiskKey, string> = {
  singleFounder: "Single Founder Risk",
  singleClient: "Single Client Risk",
  negativeCashFlow: "Negative Cash Flow",
  legalIssues: "Legal Issues",
  heavyDebt: "Heavy Debt",
};

const METHOD_KEYS = Object.keys(VALUATION_METHOD_LABELS) as ValuationMethodKey[];
const RISK_KEYS = Object.keys(VALUATION_RISK_LABELS) as ValuationRiskKey[];

export function defaultValuationSettings(): ValuationSettings {
  return {
    schemaVersion: 2,
    businessType: "mixed",
    revenueMultiple: 2.5,
    ebitdaMultiple: 5,
    dcfEnabled: false,
    dcfDiscountRate: 25,
    dcfGrowthRate: 8,
    dcfTerminalGrowthRate: 3,
    dcfYears: 5,
    growthStage: "early_revenue",
    marketPosition: "local",
    founderDependency: 100,
    founderMaxDeduction: 20,
    competitiveAdvantage: 1,
    technologyAdvantage: 1,
    brandRecognition: 1,
    customerRetention: 50,
    recurringRevenueQuality: 1,
    weights: {
      asset: 20,
      revenue: 35,
      ebitda: 20,
      dcf: 0,
      startupScore: 0,
      goodwill: 15,
    },
    goodwillWeight: 15,
    goodwillScores: {
      brand: 0,
      clientReputation: 0,
      repeatClients: 0,
      whiteLabelPartnerships: 0,
      technology: 0,
      aiCapability: 0,
      saasProducts: 0,
      researchIp: 0,
      marketNetwork: 0,
      operationalMaturity: 0,
    },
    startupPremiumCriteria: {
      ownSoftware: false,
      ownSourceCode: false,
      ownDomain: false,
      ownBrand: false,
      ownGithub: false,
      teamSize: 0,
    },
    financialStatementsComplete: false,
    goodwillManualAdjustment: 0,
    manualValuationAdjustment: 0,
    manualAssets: { bankBalance: 0, deposits: 0, investments: 0, otherAssets: 0 },
    liabilities: {
      loans: 0,
      creditors: 0,
      taxesPayable: 0,
      vendorPayments: 0,
      pendingSalaries: 0,
      otherLiabilities: 0,
    },
    liabilitiesConfirmed: false,
    riskEnabled: {
      singleFounder: true,
      singleClient: true,
      negativeCashFlow: true,
      legalIssues: false,
      heavyDebt: true,
    },
    riskDeductions: {
      singleFounder: 20,
      singleClient: 10,
      negativeCashFlow: 10,
      legalIssues: 10,
      heavyDebt: 5,
    },
    healthManualScores: {
      teamStability: 5,
      financialDiscipline: 5,
      documentation: 5,
      operationalMaturity: 5,
    },
    updatedAt: Date.now(),
  };
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeValuationSettings(
  value: Partial<ValuationSettings> | undefined,
): ValuationSettings {
  const defaults = defaultValuationSettings();
  if (!value) return defaults;
  const weights = { ...defaults.weights, ...(value.weights ?? {}) };
  const legacyGoodwill = (value.goodwillScores ?? {}) as Record<string, number>;
  const goodwillScores = {
    brand: legacyGoodwill.brand ?? legacyGoodwill.brandRecognition ?? 0,
    clientReputation: legacyGoodwill.clientReputation ?? 0,
    repeatClients: legacyGoodwill.repeatClients ?? 0,
    whiteLabelPartnerships:
      legacyGoodwill.whiteLabelPartnerships ?? legacyGoodwill.partnershipStrength ?? 0,
    technology: legacyGoodwill.technology ?? legacyGoodwill.proprietarySoftware ?? 0,
    aiCapability: legacyGoodwill.aiCapability ?? 0,
    saasProducts: legacyGoodwill.saasProducts ?? 0,
    researchIp: legacyGoodwill.researchIp ?? legacyGoodwill.ipOwnership ?? 0,
    marketNetwork: legacyGoodwill.marketNetwork ?? legacyGoodwill.referralNetwork ?? 0,
    operationalMaturity: legacyGoodwill.operationalMaturity ?? legacyGoodwill.yearsInBusiness ?? 0,
  };
  const riskEnabled = { ...defaults.riskEnabled, ...(value.riskEnabled ?? {}) };
  const riskDeductions = { ...defaults.riskDeductions, ...(value.riskDeductions ?? {}) };
  const healthManualScores = {
    ...defaults.healthManualScores,
    ...(value.healthManualScores ?? {}),
  };
  const growthStages: ValuationSettings["growthStage"][] = [
    "pre_revenue",
    "early_revenue",
    "growing",
    "scaling",
    "established",
  ];
  const marketPositions: ValuationSettings["marketPosition"][] = [
    "unknown",
    "local",
    "regional",
    "national",
    "international",
  ];
  const businessTypes: ValuationSettings["businessType"][] = ["service", "software", "mixed"];
  return {
    ...defaults,
    ...value,
    schemaVersion: 2,
    revenueMultiple: clamp(
      finite(
        value.schemaVersion !== 2 && value.revenueMultiple === 2
          ? defaults.revenueMultiple
          : value.revenueMultiple,
        defaults.revenueMultiple,
      ),
      0,
      20,
    ),
    ebitdaMultiple: clamp(finite(value.ebitdaMultiple, defaults.ebitdaMultiple), 0, 30),
    businessType: businessTypes.includes(value.businessType as ValuationSettings["businessType"])
      ? (value.businessType as ValuationSettings["businessType"])
      : defaults.businessType,
    dcfDiscountRate: clamp(finite(value.dcfDiscountRate, defaults.dcfDiscountRate), 5, 80),
    dcfGrowthRate: clamp(finite(value.dcfGrowthRate, defaults.dcfGrowthRate), -20, 30),
    dcfTerminalGrowthRate: clamp(
      finite(value.dcfTerminalGrowthRate, defaults.dcfTerminalGrowthRate),
      0,
      10,
    ),
    dcfYears: Math.round(clamp(finite(value.dcfYears, defaults.dcfYears), 1, 10)),
    dcfEnabled: value.dcfEnabled === true,
    growthStage: growthStages.includes(value.growthStage as ValuationSettings["growthStage"])
      ? (value.growthStage as ValuationSettings["growthStage"])
      : defaults.growthStage,
    marketPosition: marketPositions.includes(
      value.marketPosition as ValuationSettings["marketPosition"],
    )
      ? (value.marketPosition as ValuationSettings["marketPosition"])
      : defaults.marketPosition,
    founderDependency: clamp(finite(value.founderDependency, defaults.founderDependency), 0, 100),
    founderMaxDeduction: clamp(
      finite(value.founderMaxDeduction, defaults.founderMaxDeduction),
      0,
      50,
    ),
    customerRetention: clamp(finite(value.customerRetention, defaults.customerRetention), 0, 100),
    competitiveAdvantage: clamp(
      finite(value.competitiveAdvantage, defaults.competitiveAdvantage),
      0,
      3,
    ),
    technologyAdvantage: clamp(
      finite(value.technologyAdvantage, defaults.technologyAdvantage),
      0,
      4,
    ),
    brandRecognition: clamp(finite(value.brandRecognition, defaults.brandRecognition), 0, 3),
    recurringRevenueQuality: clamp(
      finite(value.recurringRevenueQuality, defaults.recurringRevenueQuality),
      0,
      2,
    ),
    customerConcentrationOverride:
      value.customerConcentrationOverride == null
        ? undefined
        : clamp(finite(value.customerConcentrationOverride, 0), 0, 100),
    weights: Object.fromEntries(
      METHOD_KEYS.map((key) => [key, clamp(finite(weights[key], defaults.weights[key]), 0, 100)]),
    ) as Record<ValuationMethodKey, number>,
    goodwillWeight: clamp(finite(value.goodwillWeight, defaults.goodwillWeight), 0, 30),
    goodwillScores: Object.fromEntries(
      Object.keys(defaults.goodwillScores).map((key) => [
        key,
        clamp(finite(goodwillScores[key as keyof typeof goodwillScores], 0), 0, 10),
      ]),
    ) as ValuationSettings["goodwillScores"],
    manualAssets: {
      bankBalance: Math.max(0, finite(value.manualAssets?.bankBalance, 0)),
      deposits: Math.max(0, finite(value.manualAssets?.deposits, 0)),
      investments: Math.max(0, finite(value.manualAssets?.investments, 0)),
      otherAssets: Math.max(0, finite(value.manualAssets?.otherAssets, 0)),
    },
    liabilities: {
      loans: Math.max(0, finite(value.liabilities?.loans, 0)),
      creditors: Math.max(0, finite(value.liabilities?.creditors, 0)),
      taxesPayable: Math.max(0, finite(value.liabilities?.taxesPayable, 0)),
      vendorPayments: Math.max(0, finite(value.liabilities?.vendorPayments, 0)),
      pendingSalaries: Math.max(0, finite(value.liabilities?.pendingSalaries, 0)),
      otherLiabilities: Math.max(0, finite(value.liabilities?.otherLiabilities, 0)),
    },
    liabilitiesConfirmed: value.liabilitiesConfirmed === true,
    financialStatementsComplete: value.financialStatementsComplete === true,
    startupPremiumCriteria: {
      ownSoftware: value.startupPremiumCriteria?.ownSoftware === true,
      ownSourceCode: value.startupPremiumCriteria?.ownSourceCode === true,
      ownDomain: value.startupPremiumCriteria?.ownDomain === true,
      ownBrand: value.startupPremiumCriteria?.ownBrand === true,
      ownGithub: value.startupPremiumCriteria?.ownGithub === true,
      teamSize: Math.max(0, Math.round(finite(value.startupPremiumCriteria?.teamSize, 0))),
    },
    riskEnabled: Object.fromEntries(
      RISK_KEYS.map((key) => [key, riskEnabled[key] === true]),
    ) as Record<ValuationRiskKey, boolean>,
    riskDeductions: Object.fromEntries(
      RISK_KEYS.map((key) => [
        key,
        clamp(finite(riskDeductions[key], defaults.riskDeductions[key]), 0, 30),
      ]),
    ) as Record<ValuationRiskKey, number>,
    healthManualScores: Object.fromEntries(
      Object.keys(defaults.healthManualScores).map((key) => [
        key,
        clamp(finite(healthManualScores[key as keyof typeof healthManualScores], 5), 0, 10),
      ]),
    ) as ValuationSettings["healthManualScores"],
    goodwillManualAdjustment: finite(value.goodwillManualAdjustment, 0),
    manualValuationAdjustment: finite(value.manualValuationAdjustment, 0),
    updatedAt: finite(value.updatedAt, Date.now()),
  };
}

export interface ValuationMethodResult {
  key: ValuationMethodKey;
  value: number;
  formula: string;
  explanation: string;
  assumptions: string[];
}

export interface ValuationResult {
  asOfDate: string;
  estimatedValuation: number;
  enterpriseValue: number;
  netWorth: number;
  assetValue: number;
  goodwillValue: number;
  startupPremiumValue: number;
  riskDeductionValue: number;
  revenueMultipleValue: number;
  ebitdaValue: number;
  dcfValue: number;
  startupScoreValue: number;
  weightedBeforeAdjustments: number;
  founderDeductionPercent: number;
  riskDeductionPercent: number;
  manualAdjustment: number;
  confidence: "High" | "Medium" | "Low";
  confidenceReasons: string[];
  annualRevenueBasis: "booked" | "received";
  annualRevenueUsed: number;
  methods: ValuationMethodResult[];
  metrics: {
    monthlyRevenue: number;
    annualRevenue: number;
    mrr: number;
    arr: number;
    recurringRevenue: number;
    oneTimeRevenue: number;
    pendingRevenue: number;
    receivedRevenue: number;
    ttmExpenses: number;
    ebitda: number;
    ebitdaMargin: number;
    cash: number;
    fixedAssets: number;
    receivables: number;
    totalAssets: number;
    totalLiabilities: number;
    growthRate: number;
    customerConcentration: number;
    goodwillScore: number;
    healthScore: number;
    startupScore: number;
    expectedRevenue: number;
    bookedRevenue: number;
  };
  healthFactors: Record<string, number>;
  activeRisks: { key: ValuationRiskKey; label: string; deduction: number; automatic: boolean }[];
  increases: string[];
  reductions: string[];
  assumptions: string[];
  missingData: string[];
}

function sumBy<T>(items: T[], selector: (item: T) => number): number {
  return items.reduce((sum, item) => sum + selector(item), 0);
}

function goodwillMultiplier(score: number): number {
  if (score < 20) return 0;
  if (score < 40) return 0.05;
  if (score < 60) return 0.1;
  if (score < 80) return 0.2;
  return 0.35;
}

function scoreFromMargin(margin: number): number {
  if (margin <= 0) return 0;
  return clamp((margin / 25) * 10, 0, 10);
}

function stableHash(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 33) ^ text.charCodeAt(index);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function valuationAssumptionsHash(settings: ValuationSettings): string {
  return stableHash(settings);
}

export function calculateValuation(
  ops: OperationsData,
  invoices: Invoice[],
  rawSettings?: Partial<ValuationSettings>,
  now = new Date(),
): ValuationResult {
  const settings = normalizeValuationSettings(rawSettings);
  const asOfDate = now.toISOString().slice(0, 10);
  const currentStart = new Date(now);
  currentStart.setFullYear(currentStart.getFullYear() - 1);
  const previousStart = new Date(currentStart);
  previousStart.setFullYear(previousStart.getFullYear() - 1);
  const currentStartKey = currentStart.toISOString().slice(0, 10);
  const previousStartKey = previousStart.toISOString().slice(0, 10);

  const transactions = ops.transactions ?? [];
  const currentTransactions = transactions.filter(
    (transaction) => transaction.date >= currentStartKey && transaction.date <= asOfDate,
  );
  const previousTransactions = transactions.filter(
    (transaction) => transaction.date >= previousStartKey && transaction.date < currentStartKey,
  );

  const revenueFor = (items: typeof transactions) =>
    sumBy(items, (transaction) => {
      if (transaction.type === "client_payment") return transaction.amount;
      if (transaction.type === "refund") return -Math.abs(transaction.amount);
      return 0;
    });
  const expenseFor = (items: typeof transactions) =>
    sumBy(items, (transaction) => {
      if (transaction.type === "expense") return transaction.amount;
      if (isFounderSalary(transaction)) return transaction.amount;
      return 0;
    });

  const annualRevenue = Math.max(0, revenueFor(currentTransactions));
  const previousAnnualRevenue = Math.max(0, revenueFor(previousTransactions));
  const growthRate =
    previousAnnualRevenue > 0
      ? ((annualRevenue - previousAnnualRevenue) / previousAnnualRevenue) * 100
      : 0;
  const ttmExpenses = expenseFor(currentTransactions);
  const ebitda = annualRevenue - ttmExpenses;
  const ebitdaMargin = annualRevenue > 0 ? (ebitda / annualRevenue) * 100 : 0;

  const mrr = sumActiveMrr(ops.projects ?? [], asOfDate);
  const arr = mrr * 12;
  const recurringRevenue = Math.min(annualRevenue, arr);
  const oneTimeRevenue = Math.max(0, annualRevenue - recurringRevenue);

  const payments = ops.payments ?? [];
  const validInvoices = invoices.filter((invoice) => invoice.status !== "cancelled");
  const receivables = sumBy(
    validInvoices,
    (invoice) => calculateInvoicePayments(invoice, payments).outstandingBalance,
  );
  const pendingRevenue = receivables;
  const expectedRevenue = sumBy(
    (ops.leads ?? []).filter((lead) => lead.status !== "won" && lead.status !== "lost"),
    (lead) => (lead.expectedRevenue ?? 0) * ((lead.probability ?? 0) / 100),
  );
  const bookedRevenue = sumPipelineBookedRevenue(ops.projects ?? [], asOfDate);

  const cash = sumBy(transactions, (transaction) => {
    if (transaction.type === "client_payment" || transaction.type === "founder_investment") {
      return transaction.amount;
    }
    if (
      transaction.type === "expense" ||
      transaction.type === "founder_withdrawal" ||
      transaction.type === "refund"
    ) {
      return -Math.abs(transaction.amount);
    }
    return 0;
  });
  const fixedAssets = sumBy(
    (ops.assets ?? []).filter((asset) => asset.category !== "cash"),
    (asset) => Math.max(0, asset.value),
  );
  const manualAssets = sumBy(Object.values(settings.manualAssets), (value) => value);
  const totalAssets = Math.max(0, cash) + fixedAssets + receivables + manualAssets;
  const totalLiabilities = sumBy(Object.values(settings.liabilities), (value) => value);
  const netWorth = totalAssets - totalLiabilities;
  const assetValue = Math.max(0, netWorth);

  const invoiceRevenue = sumBy(validInvoices, (invoice) => computeTotals(invoice).subtotal);
  const clientRevenue = new Map<string, number>();
  for (const transaction of currentTransactions) {
    if (transaction.type !== "client_payment") continue;
    const fallback = transaction.description
      .replace(/^payment from\s*/i, "")
      .split(" (")[0]
      .trim();
    const key = transaction.relatedClientId || fallback || "unmapped";
    clientRevenue.set(key, (clientRevenue.get(key) ?? 0) + transaction.amount);
  }
  const largestClientRevenue = Math.max(0, ...clientRevenue.values());
  const autoConcentration = annualRevenue > 0 ? (largestClientRevenue / annualRevenue) * 100 : 0;
  const customerConcentration =
    settings.customerConcentrationOverride == null
      ? autoConcentration
      : clamp(settings.customerConcentrationOverride, 0, 100);

  const growthScore =
    previousAnnualRevenue > 0 ? clamp(5 + growthRate / 10, 0, 10) : annualRevenue > 0 ? 3 : 0;
  const profitabilityScore = scoreFromMargin(ebitdaMargin);
  const cashFlowScore = ebitda <= 0 ? 0 : clamp((ebitda / Math.max(annualRevenue, 1)) * 40, 0, 10);
  const diversificationScore = clamp(10 - customerConcentration / 10, 0, 10);
  const recurringScore =
    annualRevenue > 0 ? clamp((recurringRevenue / annualRevenue) * 10, 0, 10) : 0;
  const debtRatio = totalAssets > 0 ? totalLiabilities / totalAssets : totalLiabilities > 0 ? 1 : 0;
  const debtScore = clamp(10 - debtRatio * 10, 0, 10);
  const healthFactors = {
    "Revenue Growth": growthScore,
    Profitability: profitabilityScore,
    "Cash Flow": cashFlowScore,
    "Client Diversification": diversificationScore,
    "Recurring Revenue": recurringScore,
    "Team Stability": settings.healthManualScores.teamStability,
    "Financial Discipline": settings.healthManualScores.financialDiscipline,
    "Debt Ratio": debtScore,
    Documentation: settings.healthManualScores.documentation,
    "Operational Maturity": settings.healthManualScores.operationalMaturity,
  };
  const healthScore = sumBy(Object.values(healthFactors), (value) => value);
  const growthStageScore = {
    pre_revenue: 0,
    early_revenue: 3,
    growing: 6,
    scaling: 8,
    established: 10,
  }[settings.growthStage];
  const marketPositionScore = {
    unknown: 0,
    local: 3,
    regional: 5,
    national: 8,
    international: 10,
  }[settings.marketPosition];
  const qualitativeScores = [
    growthStageScore,
    marketPositionScore,
    (settings.competitiveAdvantage / 3) * 10,
    (settings.technologyAdvantage / 4) * 10,
    (settings.brandRecognition / 3) * 10,
    settings.customerRetention / 10,
    (settings.recurringRevenueQuality / 2) * 10,
    clamp(10 - customerConcentration / 10, 0, 10),
  ];
  const qualitativeScore = (sumBy(qualitativeScores, (value) => value) / 80) * 100;
  const startupScore = healthScore * 0.6 + qualitativeScore * 0.4;

  const annualRevenueUsed = bookedRevenue > 0 ? bookedRevenue : annualRevenue;
  const annualRevenueBasis: ValuationResult["annualRevenueBasis"] =
    bookedRevenue > 0 ? "booked" : "received";
  const revenueMultipleValue = annualRevenueUsed * settings.revenueMultiple;
  const ebitdaValue = ebitda > 0 ? ebitda * settings.ebitdaMultiple : 0;

  const methods: ValuationMethodResult[] = [
    {
      key: "asset",
      value: assetValue,
      formula:
        "Ledger cash + bank balance + equipment/furniture/assets + investments/deposits + receivables − liabilities",
      explanation:
        "Net Asset Value is shown independently and receives only its configured hybrid weight.",
      assumptions: [
        "Recorded non-cash asset values are treated as current carrying values.",
        "Manual bank balance and other balance-sheet inputs require admin confirmation.",
      ],
    },
    {
      key: "revenue",
      value: revenueMultipleValue,
      formula: `${annualRevenueBasis === "booked" ? "Annual booked revenue" : "TTM received revenue"} × ${settings.revenueMultiple.toFixed(2)}x`,
      explanation:
        annualRevenueBasis === "booked"
          ? "Booked project revenue exists, so it is preferred over received cash."
          : "No booked project revenue exists, so trailing-12-month receipts are used.",
      assumptions: [
        `${settings.businessType.replace("_", " ")} business industry multiple selected by admin.`,
      ],
    },
    {
      key: "ebitda",
      value: ebitdaValue,
      formula: `TTM EBITDA × ${settings.ebitdaMultiple.toFixed(2)}x`,
      explanation:
        ebitda > 0
          ? "Positive EBITDA contributes to the hybrid valuation."
          : "EBITDA is non-positive, so this method is ignored and its weight is redistributed.",
      assumptions: [
        "EBITDA uses received revenue less recorded operating costs and founder salary.",
      ],
    },
  ];

  const activeMethods = methods.filter((method) => method.key !== "ebitda" || ebitda > 0);
  const totalCoreWeight = sumBy(activeMethods, (method) => settings.weights[method.key]);
  const weightedBeforeAdjustments =
    totalCoreWeight > 0
      ? sumBy(
          activeMethods,
          (method) => method.value * (settings.weights[method.key] / totalCoreWeight),
        )
      : 0;
  const averageValuation =
    activeMethods.length > 0
      ? sumBy(activeMethods, (method) => method.value) / activeMethods.length
      : 0;

  const goodwillScore = sumBy(Object.values(settings.goodwillScores), (value) => value);
  const goodwillValue = Math.max(
    0,
    averageValuation * goodwillMultiplier(goodwillScore) * (settings.goodwillWeight / 15) +
      settings.goodwillManualAdjustment,
  );

  const startupCriteria = settings.startupPremiumCriteria;
  const startupPremiumQualified =
    startupCriteria.ownSoftware &&
    startupCriteria.ownSourceCode &&
    startupCriteria.ownDomain &&
    startupCriteria.ownBrand &&
    startupCriteria.ownGithub &&
    startupCriteria.teamSize >= 3 &&
    recurringRevenue > 0;
  const startupPremiumValue = startupPremiumQualified
    ? (weightedBeforeAdjustments + goodwillValue) * 0.1
    : 0;

  const riskPercentages: Record<ValuationRiskKey, number> = {
    singleFounder: settings.riskEnabled.singleFounder
      ? (settings.founderDependency / 100) * Math.min(20, settings.riskDeductions.singleFounder)
      : 0,
    singleClient: settings.riskEnabled.singleClient
      ? (customerConcentration / 100) * Math.min(10, settings.riskDeductions.singleClient)
      : 0,
    negativeCashFlow:
      settings.riskEnabled.negativeCashFlow && ebitda < 0
        ? Math.min(10, settings.riskDeductions.negativeCashFlow)
        : 0,
    legalIssues: settings.riskEnabled.legalIssues
      ? Math.min(10, settings.riskDeductions.legalIssues)
      : 0,
    heavyDebt: settings.riskEnabled.heavyDebt
      ? clamp(debtRatio, 0, 1) * Math.min(5, settings.riskDeductions.heavyDebt)
      : 0,
  };
  const activeRisks = RISK_KEYS.filter((key) => riskPercentages[key] > 0).map((key) => ({
    key,
    label: VALUATION_RISK_LABELS[key],
    deduction: riskPercentages[key],
    automatic: key !== "legalIssues",
  }));
  const founderDeductionPercent = riskPercentages.singleFounder;
  const riskDeductionPercent = Math.min(
    35,
    sumBy(activeRisks, (risk) => risk.deduction),
  );
  const preRiskValuation = weightedBeforeAdjustments + goodwillValue + startupPremiumValue;
  const riskDeductionValue = preRiskValuation * (riskDeductionPercent / 100);
  const estimatedValuation = Math.max(
    0,
    preRiskValuation - riskDeductionValue + settings.manualValuationAdjustment,
  );
  const enterpriseValue = Math.max(
    0,
    estimatedValuation + settings.liabilities.loans - Math.max(0, cash),
  );

  const missingData: string[] = [];
  if (!settings.liabilitiesConfirmed) missingData.push("Liability balances are not confirmed.");
  if ((ops.assets ?? []).length === 0) missingData.push("No fixed assets are recorded.");
  if (previousAnnualRevenue === 0)
    missingData.push("No comparable prior-year revenue exists for growth scoring.");
  if (clientRevenue.size === 0)
    missingData.push("Client-linked receipts are insufficient for concentration analysis.");
  if (annualRevenue === 0) missingData.push("No trailing-12-month received revenue is recorded.");
  if (invoices.length === 0) missingData.push("No invoice data exists for receivables.");

  const revenueHistoryOver12Months = transactions.some(
    (transaction) => transaction.type === "client_payment" && transaction.date <= currentStartKey,
  );
  const lowDebt = debtRatio <= 0.25;
  const confidenceChecks = [
    revenueHistoryOver12Months,
    ebitda > 0,
    settings.financialStatementsComplete && settings.liabilitiesConfirmed,
    lowDebt,
  ];
  const confidencePoints = confidenceChecks.filter(Boolean).length;
  const confidence: ValuationResult["confidence"] =
    confidencePoints === 4 ? "High" : confidencePoints >= 2 ? "Medium" : "Low";
  const confidenceReasons = [
    revenueHistoryOver12Months
      ? "More than 12 months of revenue history is available."
      : "Revenue history does not yet exceed 12 months.",
    ebitda > 0 ? "EBITDA is positive." : "EBITDA is non-positive.",
    settings.financialStatementsComplete && settings.liabilitiesConfirmed
      ? "Financial statements and liabilities are confirmed complete."
      : "Financial statements or liabilities are not confirmed complete.",
    lowDebt ? "Debt is low relative to assets." : "Debt is material relative to assets.",
  ];

  const increases = [
    annualRevenueUsed > 0
      ? `${annualRevenueBasis === "booked" ? "Annual booked" : "TTM received"} revenue of ₹${Math.round(annualRevenueUsed).toLocaleString("en-IN")}.`
      : "",
    ebitda > 0 ? `Positive EBITDA margin of ${ebitdaMargin.toFixed(1)}%.` : "",
    recurringRevenue > 0
      ? `Recurring ARR contribution of ₹${Math.round(arr).toLocaleString("en-IN")}.`
      : "",
    goodwillValue > 0
      ? `Scored goodwill contributes ₹${Math.round(goodwillValue).toLocaleString("en-IN")}.`
      : "",
    startupPremiumValue > 0
      ? `All startup ownership tests passed, adding a 10% premium of ₹${Math.round(startupPremiumValue).toLocaleString("en-IN")}.`
      : "",
  ].filter(Boolean);
  const reductions = [
    ...activeRisks.map((risk) => `${risk.label} deducts ${risk.deduction.toFixed(1)}%.`),
    ebitda <= 0
      ? "Non-positive EBITDA removes the EBITDA method and redistributes its weight."
      : "",
  ].filter(Boolean);
  const assumptions = [
    `Business type: ${settings.businessType}; ${annualRevenueBasis} revenue basis selected automatically.`,
    `Revenue multiple: ${settings.revenueMultiple.toFixed(2)}x.`,
    `EBITDA multiple: ${settings.ebitdaMultiple.toFixed(2)}x.`,
    `Core weights are normalized across active methods; EBITDA weight is redistributed when EBITDA is non-positive.`,
    `Goodwill score ${goodwillScore.toFixed(0)}/100 applies a ${(goodwillMultiplier(goodwillScore) * 100).toFixed(0)}% multiplier to the average active valuation.`,
    `Invoice subtotal recorded to date: ₹${Math.round(invoiceRevenue).toLocaleString("en-IN")} (disclosed, not added to received revenue).`,
    "Expected lead revenue remains disclosed but is excluded from valuation.",
  ];

  return {
    asOfDate,
    estimatedValuation,
    enterpriseValue,
    netWorth,
    assetValue,
    goodwillValue,
    startupPremiumValue,
    riskDeductionValue,
    revenueMultipleValue,
    ebitdaValue,
    dcfValue: 0,
    startupScoreValue: 0,
    weightedBeforeAdjustments,
    founderDeductionPercent,
    riskDeductionPercent,
    manualAdjustment: settings.manualValuationAdjustment,
    confidence,
    confidenceReasons,
    annualRevenueBasis,
    annualRevenueUsed,
    methods,
    metrics: {
      monthlyRevenue: annualRevenueUsed / 12,
      annualRevenue: annualRevenueUsed,
      mrr,
      arr,
      recurringRevenue,
      oneTimeRevenue,
      pendingRevenue,
      receivedRevenue: annualRevenue,
      ttmExpenses,
      ebitda,
      ebitdaMargin,
      cash,
      fixedAssets,
      receivables,
      totalAssets,
      totalLiabilities,
      growthRate,
      customerConcentration,
      goodwillScore,
      healthScore,
      startupScore,
      expectedRevenue,
      bookedRevenue,
    },
    healthFactors,
    activeRisks,
    increases,
    reductions,
    assumptions,
    missingData,
  };
}
