export type TeamMemberType = "founder" | "employee" | "intern" | "contractor";

/** A person who works for the company and can own projects or receive payroll. */
export interface CompanyMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  /** e.g. Partner, Director, Developer, Operations */
  role?: string;
  memberType?: TeamMemberType;
  joinDate?: string;
  status?: "active" | "inactive";
  /** Guaranteed monthly salary. Variable bonuses are recorded month by month. */
  baseMonthlySalary?: number;
  /** Maximum suggested bonus for a month; the actual bonus defaults to zero. */
  monthlyBonusCap?: number;
  /** Salary schedule start and due day. */
  salaryStartDate?: string;
  salaryDueDay?: number;
}

export interface CompanySettings {
  organizationId?: string;
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
  /** One-time upgrade from the old partners-only list to the Team directory. */
  teamDirectoryMigrationApplied?: boolean;
  paymentTerms?: string;
  remarks?: string;
  paymentMode?: string;
  /** Whether receipt/proof uploads are shown in financial transaction forms. */
  paymentProofUploadsEnabled?: boolean;
  /** Feature flag for the unfinished Company Valuation module. */
  companyValuationEnabled?: boolean;
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
  /** Created from an Accounts transaction after Ground Zero. */
  recordedAfterMigration?: boolean;
  /** Marks this as a monthly recurring installment (retainer/contract). */
  recurring?: boolean;
  proof?: {
    imageDataUrl: string;
    fileName?: string;
    mimeType?: string;
    uploadedAt: string;
  };
}

export interface Milestone {
  id: string;
  name: string;
  description?: string;
  dueDate?: string;
  status: "pending" | "in_progress" | "completed" | "delayed";
  paymentTrigger?: boolean;
  assignedUser?: string;
  completedDate?: string;
}

export interface Project {
  id: string;
  organizationId?: string;
  clientId?: string;
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
  /**
   * Payments collected before the Ground Zero migration (imported once from Excel).
   * Never creates accounting transactions — Total Received = historicalReceived + Σ payments.
   */
  historicalReceived?: number;
  /**
   * Authoritative remaining balance imported at Ground Zero. `null` means the
   * source did not define an outstanding amount. New payments deduct from it.
   */
  historicalOutstanding?: number | null;
  /** Installments received after migration — each one mirrors into the Accounts ledger. */
  payments?: ProjectPayment[];
  startDate?: string;
  endDate?: string;
  deadline?: string;
  budget?: number;
  estimatedCost?: number;
  priority?: "low" | "medium" | "high";
  /** @deprecated Single owner — superseded by `assignedMembers`; kept for older rows. */
  assignedPartner?: string;
  /** Team member ids working on this project (several people can share one project). */
  assignedMembers?: string[];
  notes?: string;
  milestones?: Milestone[];
  phone?: string;
  email?: string;
}

/** How a project is billed — upfront, recurring, or both. */
export interface ProjectBilling {
  /**
   * Authoritative total contract value (₹) imported from the Ground Zero Excel.
   * When set, it overrides any derived upfront/monthly totals — Pending = contractValue − Total Received.
   */
  contractValue?: number;
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
  /** Retainer closed permanently on this date — no longer active MRR or future monthly. */
  monthlyEndDate?: string;
}

export type PartnershipStatus = "active" | "inactive" | "prospect";

export interface Partnership {
  id: string;
  organizationId?: string;
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

export type LeadStatus =
  | "new_lead"
  | "contacted"
  | "meeting_scheduled"
  | "proposal_sent"
  | "negotiation"
  | "won"
  | "lost";

/** Sales / CRM lead / deal pipeline entry */
export interface Lead {
  id: string;
  organizationId?: string;
  name?: string;
  business?: string;
  company: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  notes?: string;
  status: LeadStatus;
  source?: string;
  expectedRevenue?: number;
  probability?: number;
  expectedClosingDate?: string;
  assignedSalesperson?: string;
  createdAt?: string;
}

/** Directory contact — a saved person, not yet a lead. Moving to Leads removes it from the directory. */
export interface Contact {
  id: string;
  organizationId?: string;
  personName: string;
  companyName?: string;
  phone?: string;
  /** Who to reach them through when there's no direct phone. */
  contactVia?: string;
  createdAt?: string;
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
  organizationId?: string;
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

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  priority: "low" | "medium" | "high";
  read: boolean;
  timestamp: string;
  relatedModule:
    | "invoices"
    | "payments"
    | "accounts"
    | "projects"
    | "leads"
    | "documents"
    | "calendar"
    | "system";
  actionUrl?: string;
  actionLabel?: string;
}

export type ScheduleEventType = "meeting" | "call";
export type ScheduleEventStatus = "scheduled" | "completed" | "cancelled";

export interface ScheduleEvent {
  id: string;
  title: string;
  type: ScheduleEventType;
  date: string;
  startTime: string;
  durationMinutes: number;
  contact?: string;
  location?: string;
  meetingUrl?: string;
  notes?: string;
  reminderMinutes: number;
  status: ScheduleEventStatus;
  createdAt: number;
  updatedAt: number;
}

export type ValuationMethodKey =
  | "asset"
  | "revenue"
  | "ebitda"
  | "dcf"
  | "startupScore"
  | "goodwill";

export type ValuationRiskKey =
  | "singleFounder"
  | "singleClient"
  | "negativeCashFlow"
  | "legalIssues"
  | "heavyDebt";

export interface ValuationSettings {
  schemaVersion: 2;
  businessType: "service" | "software" | "mixed";
  revenueMultiple: number;
  ebitdaMultiple: number;
  dcfEnabled: boolean;
  dcfDiscountRate: number;
  dcfGrowthRate: number;
  dcfTerminalGrowthRate: number;
  dcfYears: number;
  growthStage: "pre_revenue" | "early_revenue" | "growing" | "scaling" | "established";
  marketPosition: "unknown" | "local" | "regional" | "national" | "international";
  founderDependency: number;
  founderMaxDeduction: number;
  competitiveAdvantage: number;
  technologyAdvantage: number;
  brandRecognition: number;
  customerRetention: number;
  recurringRevenueQuality: number;
  customerConcentrationOverride?: number;
  weights: Record<ValuationMethodKey, number>;
  goodwillWeight: number;
  goodwillScores: Record<
    | "brand"
    | "clientReputation"
    | "repeatClients"
    | "whiteLabelPartnerships"
    | "technology"
    | "aiCapability"
    | "saasProducts"
    | "researchIp"
    | "marketNetwork"
    | "operationalMaturity",
    number
  >;
  startupPremiumCriteria: {
    ownSoftware: boolean;
    ownSourceCode: boolean;
    ownDomain: boolean;
    ownBrand: boolean;
    ownGithub: boolean;
    teamSize: number;
  };
  financialStatementsComplete: boolean;
  goodwillManualAdjustment: number;
  manualValuationAdjustment: number;
  manualAssets: {
    bankBalance: number;
    deposits: number;
    investments: number;
    otherAssets: number;
  };
  liabilities: {
    loans: number;
    creditors: number;
    taxesPayable: number;
    vendorPayments: number;
    pendingSalaries: number;
    otherLiabilities: number;
  };
  liabilitiesConfirmed: boolean;
  riskEnabled: Record<ValuationRiskKey, boolean>;
  riskDeductions: Record<ValuationRiskKey, number>;
  healthManualScores: {
    teamStability: number;
    financialDiscipline: number;
    documentation: number;
    operationalMaturity: number;
  };
  updatedAt: number;
}

export interface ValuationSnapshot {
  id: string;
  date: string;
  createdAt: number;
  calculatedValuation: number;
  manualAdjustment: number;
  reason: string;
  revenue: number;
  assets: number;
  profit: number;
  growth: number;
  netWorth: number;
  enterpriseValue: number;
  assumptionsHash: string;
}

export interface ValuationAuditEntry {
  id: string;
  timestamp: number;
  actor: string;
  reason: string;
  field: string;
  oldValue: string;
  newValue: string;
}

export interface OperationsData {
  projects: Project[];
  partnerships: Partnership[];
  expenses: ExpenseEntry[];
  leads?: Lead[];
  assets?: AssetEntry[];
  financialBaseline?: FinancialBaseline;
  /** Recurring monthly obligations — loan repayments, rent, subscriptions, etc. */
  fixedMonthlyExpenses?: FixedMonthlyExpense[];
  clients?: Client[];
  /** Directory contact book — people saved before they become leads. */
  contacts?: Contact[];
  payments?: Payment[];
  transactions?: Transaction[];
  founders?: Founder[];
  notifications?: AppNotification[];
  scheduleEvents?: ScheduleEvent[];
  valuationSettings?: ValuationSettings;
  valuationSnapshots?: ValuationSnapshot[];
  valuationAudit?: ValuationAuditEntry[];
  migrationApplied?: boolean;
  migrationDate?: string;
  /** Ground Zero financial reset applied — Excel is the single source of truth from this point. */
  groundZeroApplied?: boolean;
  /** One-time repair: merged the legacy "Dev" project with BLX Realty and rebuilt its ledger rows. */
  blxRepairApplied?: boolean;
  /** One-time repair: merged the legacy "k h kiran" project with Nidhi Estates. */
  neRepairApplied?: boolean;
}

export type TransactionType =
  | "client_payment"
  | "founder_investment"
  | "founder_withdrawal"
  | "expense"
  | "refund"
  | "internal_transfer"
  | "adjustment";

export interface Transaction {
  id: string;
  organizationId?: string;
  type: TransactionType;
  date: string;
  amount: number;
  description: string;
  category: string;
  paymentMethod: string;
  vendor?: string;
  gst?: number;
  relatedClientId?: string;
  relatedProjectId?: string;
  relatedInvoiceId?: string;
  relatedFounderId?: string;
  /** Team member paid by this transaction (salary, bonus, reimbursement, etc.). */
  relatedTeamMemberId?: string;
  /** Payroll period and immutable component snapshot for salary transactions. */
  payrollMonth?: string;
  salaryBaseAmount?: number;
  salaryBonusAmount?: number;
  fixedMonthlyExpenseId?: string;
  relatedVendorId?: string;
  notes?: string;
  attachmentDataUrl?: string;
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
  historical?: boolean;
}

export interface Founder {
  id: string;
  name: string;
  sharePercentage: number;
  notes?: string;
}

export interface Payment {
  id: string;
  organizationId?: string;
  invoiceId?: string;
  projectId?: string;
  amount: number;
  date: string;
  method: string;
  referenceNumber?: string;
  transactionId?: string;
  screenshotDataUrl?: string;
  notes?: string;
}

export interface Client {
  id: string;
  organizationId?: string;
  /** Relationship-level client that owns this company (billing remains on this child company). */
  parentClientId?: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  gstNumber?: string;
  pan?: string;
  billingAddress: string;
  shippingAddress?: string;
  website?: string;
  industry?: string;
  clientSince: string; // YYYY-MM-DD
  status: "active" | "inactive";
  notes?: string;
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
  /** Who receives this payment — person or company. */
  payee?: string;
  /** Set for salary schedules so names are selected from Team, not free typed. */
  teamMemberId?: string;
  amountPerMonth: number;
  /** Salary, EMI, rent, subscription, etc. */
  kind?: FixedMonthlyExpenseKind;
  /** First month this obligation applies (YYYY-MM-DD). */
  startDate: string;
  /** Fixed number of installments; blank means ongoing until manually completed. */
  totalMonths?: number;
  /** Calendar day (1–31) to remind the user each month. */
  reminderDay?: number;
  /** Checked-off installment months, stored as YYYY-MM. */
  paidMonths?: string[];
  /** Explicit workflow state; `active` remains for backwards compatibility. */
  status?: "active" | "paused" | "completed";
  notes?: string;
  active: boolean;
}

export type AgreementCounterpartyType = "client" | "partner" | "vendor" | "other";

/** Stored contract / MOU / NDA — file upload or external link. */
export interface Agreement {
  id: string;
  organizationId?: string;
  title: string;
  counterpartyName: string;
  counterpartyType: AgreementCounterpartyType;
  /** Optional link to project id, partnership id, or client slug. */
  counterpartyRef?: string;
  clientId?: string;
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
  | "document"
  | "security";

export type ActivityAction =
  | "created"
  | "updated"
  | "deleted"
  | "payment_added"
  | "payment_removed"
  | "login"
  | "logout"
  | "failed_login";

export interface ActivityLogEntry {
  id: string;
  organizationId?: string;
  timestamp: number;
  entity: ActivityEntity;
  action: ActivityAction;
  summary: string;
  entityId?: string;
  entityName?: string;
}

export interface Invoice {
  id: string; // uuid
  organizationId?: string;
  clientId?: string;
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
  status:
    | "draft"
    | "generated"
    | "sent"
    | "viewed"
    | "partially_paid"
    | "paid"
    | "cancelled"
    | "overdue";
  createdAt: number;
}
