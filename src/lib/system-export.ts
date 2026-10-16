import * as XLSX from "xlsx";
import { zipSync, strToU8 } from "fflate";
import type { CompanySettings, Invoice, OperationsData } from "./types";
import { computeFinancialSummary } from "./financial";
import { computeBookedRevenue, activeMrr } from "./project-billing";
import { paymentSummary, estimatedPending } from "./project-payments";
import { isRevenueProject } from "./project-status";
import { computeTotals } from "./invoice-calc";

function downloadBlob(content: BlobPart, type: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function buildExportSheets(ops: OperationsData, invoices: Invoice[] = [], company?: CompanySettings) {
  const today = new Date().toISOString().slice(0, 10);
  const financial = computeFinancialSummary(ops);
  const projects = ops.projects ?? [];
  const transactions = ops.transactions ?? [];
  const clients = ops.clients ?? [];
  const leads = ops.leads ?? [];
  const founders = ops.founders ?? [];

  // Sheet 1: Executive Financials & KPIs
  const activeRevProjects = projects.filter((p) => isRevenueProject(p.status));
  const totalOutstanding = activeRevProjects.reduce((sum, p) => sum + estimatedPending(p), 0);
  const totalMrr = activeRevProjects.reduce((sum, p) => sum + activeMrr(p, today), 0);

  const kpiRows = [
    { Metric: "Company Name", Value: company?.name ?? "Admark Digitals", Notes: "Operating Entity" },
    { Metric: "Export Date", Value: today, Notes: "System Generated" },
    { Metric: "Cash Balance (Liquid Capital)", Value: Math.round(financial.currentCashBalance), Notes: "Bank + Capital Balance" },
    { Metric: "Revenue Collected", Value: financial.totalRevenueReceived, Notes: "Verified Payments Received" },
    { Metric: "Total Expenses", Value: Math.round(financial.totalExpense), Notes: "Company + Vendor + Founder Spend" },
    { Metric: "Revenue Booked (Contracts + Collected)", Value: financial.totalRevenueBooked, Notes: "Realized + Committed Contracts" },
    { Metric: "Outstanding Receivables", Value: totalOutstanding, Notes: "Pending Client Balances" },
    { Metric: "Active MRR", Value: totalMrr, Notes: "Monthly Retainer Run Rate" },
  ];

  // Sheet 2: Projects & Contracts
  const projectRows = projects.map((p) => {
    const ps = paymentSummary(p);
    const pend = estimatedPending(p);
    const booked = computeBookedRevenue(p, today);
    const mrr = activeMrr(p, today);
    return {
      "Project ID": p.id,
      "Client Name": p.client || p.name,
      "Project Title": p.name || p.client,
      "Status": p.status,
      "Project Type": p.projectType || "General",
      "Contract Value (₹)": p.billing?.contractValue ?? p.billing?.upfrontAmount ?? 0,
      "Upfront Amount (₹)": p.billing?.upfrontAmount ?? 0,
      "Maintenance Amount (₹)": p.billing?.maintenanceAmount ?? 0,
      "Monthly Retainer (₹/mo)": p.billing?.monthlyAmount ?? 0,
      "Active MRR (₹)": mrr,
      "Total Received (₹)": ps.received,
      "Pending Balance (₹)": pend,
      "Booked Revenue (₹)": booked,
      "Start Date": p.startDate || p.billing?.monthlyStartDate || "—",
      "End Date": p.endDate || p.billing?.monthlyEndDate || "—",
      "Notes": p.notes || "",
    };
  });

  // Sheet 3: Transactions Ledger
  const transactionRows = [...transactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((t) => ({
      "Transaction ID": t.id,
      "Date": t.date,
      "Type": t.customType || t.type,
      "Category": t.category || "General",
      "Entity / Vendor": t.vendor || "—",
      "Description": t.description || "",
      "Amount (₹)": t.amount,
      "Payment Mode": t.paymentMethod || "—",
      "Historical Record": t.historical ? "Yes (Pre-migration)" : "No (Live)",
    }));

  // Sheet 4: Clients
  const clientRows = clients.map((c) => ({
    "Client ID": c.id,
    "Company Name": c.companyName,
    "Contact Person": c.contactPerson || "—",
    "Phone": c.phone || "—",
    "Email": c.email || "—",
    "GST Number": c.gstNumber || "—",
    "PAN Number": c.pan || "—",
    "Industry": c.industry || "—",
    "Status": c.status || "active",
    "Client Since": c.clientSince || "—",
    "Billing Address": c.billingAddress || "—",
  }));

  // Sheet 5: Invoices
  const invoiceRows = invoices.map((inv) => {
    const totals = computeTotals(inv);
    return {
      "Invoice Number": inv.number,
      "Issue Date": inv.date,
      "Due Date": inv.paymentDate || "—",
      "Client Name": inv.clientName,
      "Subtotal (₹)": totals.subtotal,
      "Tax Total (₹)": totals.tax,
      "Total (₹)": totals.total,
      "Status": inv.status || "draft",
    };
  });

  // Sheet 6: Leads / CRM Pipeline
  const leadRows = leads.map((l) => ({
    "Lead ID": l.id,
    "Company": l.company,
    "Lead Title / Name": l.name || l.company,
    "Contact Person": l.contactPerson || "—",
    "Phone": l.phone || "—",
    "Email": l.email || "—",
    "Stage / Status": l.status,
    "Estimated Value (₹)": l.expectedRevenue || 0,
    "Probability (%)": l.probability || 0,
    "Source": l.source || "—",
    "Notes": l.notes || "",
  }));

  // Sheet 7: Team Members / Founders
  const founderRows = founders.map((f) => ({
    "Member ID": f.id,
    "Name": f.name,
    "Share Percentage (%)": f.sharePercentage || 0,
    "Notes": f.notes || "",
  }));

  return {
    kpiRows,
    projectRows,
    transactionRows,
    clientRows,
    invoiceRows,
    leadRows,
    founderRows,
  };
}

/**
 * Generates and downloads a complete multi-tab Microsoft Excel (.xlsx) workbook.
 */
export function exportSystemToExcel(
  ops: OperationsData,
  invoices: Invoice[] = [],
  company?: CompanySettings,
) {
  const today = new Date().toISOString().slice(0, 10);
  const data = buildExportSheets(ops, invoices, company);

  const wb = XLSX.utils.book_new();

  const addSheet = (rows: Record<string, unknown>[], name: string) => {
    const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ Status: "No records found" }]);
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  addSheet(data.kpiRows, "Financial KPIs");
  addSheet(data.projectRows, "Projects & Contracts");
  addSheet(data.transactionRows, "Transactions Ledger");
  addSheet(data.clientRows, "Clients Directory");
  addSheet(data.invoiceRows, "Invoices");
  addSheet(data.leadRows, "CRM Leads");
  addSheet(data.founderRows, "Team & Payroll");

  const fileName = `Admark_OS_Export_${today}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/**
 * Exports all data as individual CSV files bundled into a single ZIP archive.
 */
export function exportSystemToCsvZip(
  ops: OperationsData,
  invoices: Invoice[] = [],
  company?: CompanySettings,
) {
  const today = new Date().toISOString().slice(0, 10);
  const data = buildExportSheets(ops, invoices, company);

  const toCsv = (rows: Record<string, unknown>[]) => {
    const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ Status: "No records found" }]);
    return XLSX.utils.sheet_to_csv(ws);
  };

  const zipFiles: Record<string, Uint8Array> = {
    "1_Financial_KPIs.csv": strToU8(toCsv(data.kpiRows)),
    "2_Projects_and_Contracts.csv": strToU8(toCsv(data.projectRows)),
    "3_Transactions_Ledger.csv": strToU8(toCsv(data.transactionRows)),
    "4_Clients_Directory.csv": strToU8(toCsv(data.clientRows)),
    "5_Invoices.csv": strToU8(toCsv(data.invoiceRows)),
    "6_CRM_Leads.csv": strToU8(toCsv(data.leadRows)),
    "7_Team_and_Payroll.csv": strToU8(toCsv(data.founderRows)),
  };

  const zipped = zipSync(zipFiles);
  downloadBlob(zipped, "application/zip", `Admark_OS_CSV_Export_${today}.zip`);
}

/**
 * Downloads a single table directly as a CSV file.
 */
export function exportSingleTableToCsv(
  tableName: "projects" | "transactions" | "clients" | "leads" | "invoices",
  ops: OperationsData,
  invoices: Invoice[] = [],
) {
  const today = new Date().toISOString().slice(0, 10);
  const data = buildExportSheets(ops, invoices);

  let rows: Record<string, unknown>[] = [];
  let fileBase: string = tableName;

  switch (tableName) {
    case "projects":
      rows = data.projectRows;
      fileBase = "projects_and_contracts";
      break;
    case "transactions":
      rows = data.transactionRows;
      fileBase = "transactions_ledger";
      break;
    case "clients":
      rows = data.clientRows;
      fileBase = "clients_directory";
      break;
    case "leads":
      rows = data.leadRows;
      fileBase = "crm_leads";
      break;
    case "invoices":
      rows = data.invoiceRows;
      fileBase = "invoices";
      break;
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  downloadBlob(csv, "text/csv;charset=utf-8", `admark_${fileBase}_${today}.csv`);
}
