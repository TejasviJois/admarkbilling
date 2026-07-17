import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatINRWhole } from "./invoice-calc";
import {
  VALUATION_DISCLAIMER,
  VALUATION_METHOD_LABELS,
  type ValuationResult,
} from "./valuation-engine";
import type { ValuationSettings, ValuationSnapshot } from "./types";

function downloadBlob(content: BlobPart, type: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function reportRows(result: ValuationResult, settings: ValuationSettings): string[][] {
  return [
    ["Estimated company valuation", String(result.estimatedValuation)],
    ["Enterprise value", String(result.enterpriseValue)],
    ["Net worth", String(result.netWorth)],
    [
      result.annualRevenueBasis === "booked" ? "Annual booked revenue" : "TTM received revenue",
      String(result.annualRevenueUsed),
    ],
    ["TTM EBITDA", String(result.metrics.ebitda)],
    ["Total assets", String(result.metrics.totalAssets)],
    ["Total liabilities", String(result.metrics.totalLiabilities)],
    ["Goodwill score", result.metrics.goodwillScore.toFixed(1)],
    ["Goodwill value", String(result.goodwillValue)],
    ["Startup premium", String(result.startupPremiumValue)],
    ["Risk deduction value", String(result.riskDeductionValue)],
    ["Startup health score", result.metrics.healthScore.toFixed(1)],
    ["Valuation confidence", result.confidence],
    ["Revenue multiple", `${settings.revenueMultiple}x`],
    ["EBITDA multiple", `${settings.ebitdaMultiple}x`],
    ["Risk deduction", `${result.riskDeductionPercent.toFixed(1)}%`],
    ["Founder deduction", `${result.founderDeductionPercent.toFixed(1)}%`],
    ["Manual adjustment", String(result.manualAdjustment)],
  ];
}

export function exportValuationCsv(
  result: ValuationResult,
  settings: ValuationSettings,
  history: ValuationSnapshot[],
) {
  const rows = [
    ["Company Valuation Report", result.asOfDate],
    ...reportRows(result, settings),
    [],
    ["Method", "Value", "Weight %", "Formula", "Explanation"],
    ...result.methods.map((method) => [
      VALUATION_METHOD_LABELS[method.key],
      String(method.value),
      String(settings.weights[method.key]),
      method.formula,
      method.explanation,
    ]),
    [],
    ["Risk", "Deduction %", "Source"],
    ...result.activeRisks.map((risk) => [
      risk.label,
      String(risk.deduction),
      risk.automatic ? "Automatic" : "Manual",
    ]),
    [],
    ["Startup Health Factor", "Score / 10"],
    ...Object.entries(result.healthFactors).map(([label, score]) => [label, score.toFixed(1)]),
    [],
    ["Goodwill Factor", "Score / 10"],
    ...Object.entries(settings.goodwillScores).map(([label, score]) => [label, String(score)]),
    [],
    ["Valuation History", "Valuation", "Revenue", "Profit", "Net Worth", "Reason"],
    ...history.map((snapshot) => [
      snapshot.date,
      String(snapshot.calculatedValuation),
      String(snapshot.revenue),
      String(snapshot.profit),
      String(snapshot.netWorth),
      snapshot.reason,
    ]),
    [],
    ["What increased valuation?", ...result.increases],
    ["What reduced valuation?", ...result.reductions],
    ["Assumptions", ...result.assumptions],
    ["Missing data", ...result.missingData],
    [],
    ["Disclaimer", VALUATION_DISCLAIMER],
  ];
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\r\n");
  downloadBlob(csv, "text/csv;charset=utf-8", `company-valuation-${result.asOfDate}.csv`);
}

export function exportValuationExcel(
  result: ValuationResult,
  settings: ValuationSettings,
  history: ValuationSnapshot[],
) {
  const rows = reportRows(result, settings);
  const methods = result.methods
    .map(
      (method) =>
        `<tr><td>${VALUATION_METHOD_LABELS[method.key]}</td><td>${method.value}</td><td>${settings.weights[method.key]}%</td><td>${method.formula}</td><td>${method.explanation}</td></tr>`,
    )
    .join("");
  const risks = result.activeRisks
    .map(
      (risk) =>
        `<tr><td>${risk.label}</td><td>${risk.deduction}%</td><td>${risk.automatic ? "Automatic" : "Manual"}</td></tr>`,
    )
    .join("");
  const health = Object.entries(result.healthFactors)
    .map(([label, score]) => `<tr><td>${label}</td><td>${score.toFixed(1)}/10</td></tr>`)
    .join("");
  const goodwill = Object.entries(settings.goodwillScores)
    .map(([label, score]) => `<tr><td>${label}</td><td>${score}/10</td></tr>`)
    .join("");
  const historyRows = [...history]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(
      (snapshot) =>
        `<tr><td>${snapshot.date}</td><td>${snapshot.calculatedValuation}</td><td>${snapshot.revenue}</td><td>${snapshot.profit}</td><td>${snapshot.netWorth}</td><td>${snapshot.reason}</td></tr>`,
    )
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>
    <h1>Company Valuation Report</h1><p>As of ${result.asOfDate}</p>
    <table border="1">${rows.map(([label, value]) => `<tr><th>${label}</th><td>${value}</td></tr>`).join("")}</table>
    <h2>Valuation Methods</h2><table border="1"><tr><th>Method</th><th>Value</th><th>Weight</th><th>Formula</th><th>Explanation</th></tr>${methods}</table>
    <h2>Risk Summary</h2><table border="1"><tr><th>Risk</th><th>Deduction</th><th>Source</th></tr>${risks}</table>
    <h2>Startup Health</h2><table border="1">${health}</table>
    <h2>Goodwill Score</h2><table border="1">${goodwill}</table>
    <h2>Valuation History</h2><table border="1"><tr><th>Date</th><th>Valuation</th><th>Revenue</th><th>Profit</th><th>Net Worth</th><th>Reason</th></tr>${historyRows}</table>
    <h2>Explainability</h2>
    <p><strong>Increases:</strong> ${result.increases.join(" | ")}</p>
    <p><strong>Reductions:</strong> ${result.reductions.join(" | ")}</p>
    <p><strong>Assumptions:</strong> ${result.assumptions.join(" | ")}</p>
    <p><strong>Missing data:</strong> ${result.missingData.join(" | ")}</p>
    <p>${VALUATION_DISCLAIMER}</p></body></html>`;
  downloadBlob(
    html,
    "application/vnd.ms-excel;charset=utf-8",
    `company-valuation-${result.asOfDate}.xls`,
  );
}

export function exportValuationPdf(
  result: ValuationResult,
  settings: ValuationSettings,
  history: ValuationSnapshot[],
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Internal Company Valuation Report", 40, 46);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`As of ${result.asOfDate} | Confidence: ${result.confidence}`, 40, 64);

  autoTable(doc, {
    startY: 80,
    head: [["Summary", "Amount / Value"]],
    body: reportRows(result, settings).map(([label, value]) => [
      label,
      /^-?\d+(\.\d+)?$/.test(value) ? formatINRWhole(Number(value)) : value,
    ]),
    theme: "grid",
    styles: { fontSize: 8 },
    headStyles: { fillColor: [40, 45, 55] },
  });

  autoTable(doc, {
    startY: (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable!.finalY + 16,
    head: [["Method", "Value", "Weight", "Calculation"]],
    body: result.methods.map((method) => [
      VALUATION_METHOD_LABELS[method.key],
      formatINRWhole(method.value),
      `${settings.weights[method.key]}%`,
      method.formula,
    ]),
    theme: "grid",
    styles: { fontSize: 7 },
    headStyles: { fillColor: [40, 45, 55] },
  });

  if (result.activeRisks.length > 0) {
    autoTable(doc, {
      startY: (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable!.finalY + 16,
      head: [["Risk", "Deduction", "Source"]],
      body: result.activeRisks.map((risk) => [
        risk.label,
        `${risk.deduction}%`,
        risk.automatic ? "Automatic" : "Manual",
      ]),
      theme: "grid",
      styles: { fontSize: 7 },
      headStyles: { fillColor: [40, 45, 55] },
    });
  }

  if (history.length > 0) {
    doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Valuation History", 40, 42);
    const ordered = [...history].sort((a, b) => a.date.localeCompare(b.date));
    if (ordered.length > 1) {
      const chart = { x: 50, y: 65, width: 490, height: 135 };
      const values = ordered.map((snapshot) => snapshot.calculatedValuation);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = Math.max(1, max - min);
      doc.setDrawColor(210, 215, 225);
      doc.rect(chart.x, chart.y, chart.width, chart.height);
      doc.setDrawColor(56, 189, 248);
      doc.setLineWidth(2);
      ordered.slice(1).forEach((snapshot, index) => {
        const previous = ordered[index];
        const x1 = chart.x + (index / (ordered.length - 1)) * chart.width;
        const x2 = chart.x + ((index + 1) / (ordered.length - 1)) * chart.width;
        const y1 =
          chart.y + chart.height - ((previous.calculatedValuation - min) / range) * chart.height;
        const y2 =
          chart.y + chart.height - ((snapshot.calculatedValuation - min) / range) * chart.height;
        doc.line(x1, y1, x2, y2);
      });
      doc.setFontSize(7);
      doc.text(`Low ${formatINRWhole(min)}  •  High ${formatINRWhole(max)}`, chart.x, 214);
    }
    autoTable(doc, {
      startY: ordered.length > 1 ? 230 : 56,
      head: [["Date", "Valuation", "Revenue", "Profit", "Net Worth", "Reason"]],
      body: [...ordered]
        .reverse()
        .map((snapshot) => [
          snapshot.date,
          formatINRWhole(snapshot.calculatedValuation),
          formatINRWhole(snapshot.revenue),
          formatINRWhole(snapshot.profit),
          formatINRWhole(snapshot.netWorth),
          snapshot.reason,
        ]),
      theme: "grid",
      styles: { fontSize: 7 },
      headStyles: { fillColor: [40, 45, 55] },
    });
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    const disclaimerLines = doc.splitTextToSize(VALUATION_DISCLAIMER, 510);
    doc.text(disclaimerLines, 40, 805);
  }
  doc.save(`company-valuation-${result.asOfDate}.pdf`);
}
