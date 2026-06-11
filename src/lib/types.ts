/** Internal team / company contacts (shown in settings; optional on invoices later). */
export interface CompanyMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  /** e.g. Partner, Director, Operations */
  role?: string;
}

export interface CompanySettings {
  name: string;
  tagline?: string;
  address: string;
  email: string;
  phone?: string;
  website?: string;
  pan?: string;
  gstin?: string;
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  ifsc?: string;
  branch?: string;
  upi?: string;
  logoDataUrl?: string;
  signatureDataUrl?: string;
  /** Optional PDF override; default certificate is served from `public/` when unset. */
  udyamCertificateDataUrl?: string;
  /** Extra compliance files (PDF, Word, etc.) and links (Digilocker, Drive, …). */
  complianceDocuments?: ComplianceDocument[];
  authorizedName?: string;
  /** Team members — name, email, phone for reference and settings UI. */
  companyMembers?: CompanyMember[];
}

/** Saved with company settings — file as data URL and/or a trusted https link only. */
export interface ComplianceDocument {
  id: string;
  title: string;
  fileDataUrl?: string;
  fileName?: string;
  mimeType?: string;
  /** Digilocker, Google Drive, OneDrive, etc. */
  externalUrl?: string;
}

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  rate: number;
}

export type ProjectStatus = "planning" | "active" | "on_hold" | "completed" | "cancelled";

/** Screenshot / receipt stored when payment is marked received or done. */
export interface PaymentProof {
  id: string;
  uploadedAt: string;
  fileName?: string;
  mimeType?: string;
  imageDataUrl: string;
  /** Payment status text when this proof was uploaded. */
  paymentNote?: string;
}

/** One installment / partial payment toward project revenue. */
export interface ProjectPayment {
  id: string;
  amount: number;
  date: string;
  note?: string;
  proof?: {
    imageDataUrl: string;
    fileName?: string;
    mimeType?: string;
    uploadedAt: string;
  };
}

export interface Project {
  id: string;
  /** Client / account name (primary label). */
  client: string;
  /** @deprecated Use `client` — kept for older saved rows. */
  name?: string;
  projectType?: string;
  status: ProjectStatus;
  /** Display label — auto-built from `billing` when structured fields are set. */
  revenueValue?: string;
  /** Structured contract: upfront, monthly retainer, start date, fixed months. */
  billing?: ProjectBilling;
  /** Auto summary from `payments`; legacy rows may still set this manually. */
  paymentStatus?: string;
  /** @deprecated Migrated into `payments[].proof` */
  paymentProofs?: PaymentProof[];
  payments?: ProjectPayment[];
  startDate?: string;
  endDate?: string;
  budget?: number;
  notes?: string;
  phone?: string;
  email?: string;
}

/** How a project is billed — upfront, recurring, or both. */
export interface ProjectBilling {
  /** One-time / upfront amount (₹). Counts in booked revenue when project is active. */
  upfrontAmount?: number;
  /** Flat maintenance package (₹). Counts in booked only when there is no separate project/upfront fee. */
  maintenanceAmount?: number;
  /** Duration label for maintenance, e.g. 2 months. */
  maintenanceMonths?: number;
  /** Monthly retainer (₹). Only counts after `monthlyStartDate`. */
  monthlyAmount?: number;
  /** Fixed number of monthly payments; omit for ongoing retainer. */
  monthlyMonths?: number;
  /** When monthly billing starts — until then, monthly is excluded from booked revenue. */
  monthlyStartDate?: string;
}

export type PartnershipStatus = "active" | "inactive" | "prospect";

export interface Partnership {
  id: string;
  name: string;
  /** @deprecated Prefer `phone` and `email` — kept for older saved rows. */
  contact?: string;
  phone?: string;
  email?: string;
  type?: string;
  opportunityType?: string;
  status: PartnershipStatus;
  notes?: string;
}

export type AssetCategory = "equipment" | "digital" | "cash" | "investment" | "other";

/** Company asset — equipment, cash, investments, etc. */
export interface AssetEntry {
  id: string;
  name: string;
  category: AssetCategory;
  value: number;
  acquiredDate: string;
  notes?: string;
}

export interface ExpenseEntry {
  id: string;
  label: string;
  amount: number;
  date: string;
  category?: ExpenseCategory | string;
  projectId?: string;
  /** Linked partner for external payouts. */
  partnershipId?: string;
  /** Historical rows imported from baseline reconciliation — no proof required. */
  isBaseline?: boolean;
  proof?: ExpenseProof;
  notes?: string;
}

export type ExpenseCategory = "company" | "external_payout" | "founder_payout" | "handout";

export interface ExpenseProof {
  imageDataUrl: string;
  fileName?: string;
  mimeType?: string;
  uploadedAt: string;
}

/** Reconciled totals for a closed period — no per-transaction proof. */
export interface FinancialBaseline {
  periodLabel: string;
  /** Entries dated after this day require proof; project payments after this add to revenue. */
  asOfDate: string;
  /** Contract / pipeline booked; null = derive from active projects. */
  totalRevenueBooked: number | null;
  totalHandoutsTaken: number;
  totalRevenueReceived: number;
  totalExternalPayouts: number;
  totalCompanyExpenses: number;
  founderPayoutPool: number;
}

export interface OperationsData {
  projects: Project[];
  partnerships: Partnership[];
  expenses: ExpenseEntry[];
  assets?: AssetEntry[];
  financialBaseline?: FinancialBaseline;
  /** Recurring monthly obligations — loan repayments, rent, subscriptions, etc. */
  fixedMonthlyExpenses?: FixedMonthlyExpense[];
}

/** Monthly fixed outflow (loan repayment, rent, SaaS, etc.). */
export type FixedMonthlyExpenseKind =
  | "salary"
  | "emi"
  | "rent"
  | "subscription"
  | "utility"
  | "other";

export interface FixedMonthlyExpense {
  id: string;
  label: string;
  amountPerMonth: number;
  /** Salary, EMI, rent, subscription, etc. */
  kind?: FixedMonthlyExpenseKind;
  /** First month this obligation applies (YYYY-MM-DD). */
  startDate: string;
  notes?: string;
  active: boolean;
}

export type AgreementCounterpartyType = "client" | "partner" | "vendor" | "other";

/** Stored contract / MOU / NDA — file upload or external link. */
export interface Agreement {
  id: string;
  title: string;
  counterpartyName: string;
  counterpartyType: AgreementCounterpartyType;
  /** Optional link to project id, partnership id, or client slug. */
  counterpartyRef?: string;
  signedDate?: string;
  expiryDate?: string;
  fileDataUrl?: string;
  fileName?: string;
  mimeType?: string;
  externalUrl?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

/** Agreements vault — persisted in Supabase `operations_data` row `documents`. */
export interface DocumentsData {
  agreements: Agreement[];
}

export type ActivityEntity =
  | "project"
  | "partnership"
  | "expense"
  | "invoice"
  | "settings"
  | "agreement"
  | "document";

export type ActivityAction =
  | "created"
  | "updated"
  | "deleted"
  | "payment_added"
  | "payment_removed";

export interface ActivityLogEntry {
  id: string;
  timestamp: number;
  entity: ActivityEntity;
  action: ActivityAction;
  summary: string;
  entityId?: string;
  entityName?: string;
}

export interface Invoice {
  id: string; // uuid
  number: string; // AM/26-27/0001 (legacy AM 0001/26-27 supported)
  date: string; // YYYY-MM-DD
  clientName: string;
  /** e.g. SaaS, retail, NGO — shown under client on invoice */
  clientBusinessType?: string;
  clientAddress?: string;
  clientContact?: string;
  clientPhone?: string;
  clientEmail?: string;
  clientGstin?: string;
  items: LineItem[];
  advance: number;
  taxPercent: number;
  remarks?: string;
  paymentTerms?: string;
  paymentMode?: string;
  paymentDate?: string;
  status: "paid" | "pending" | "partial" | "overdue";
  createdAt: number;
}
