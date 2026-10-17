export const BUILTIN_MEMBER_TYPES = ["founder", "employee", "intern", "contractor"] as const;
export type BuiltinMemberType = (typeof BUILTIN_MEMBER_TYPES)[number];
/** Built-in or a custom label added during registration. */
export type TeamMemberType = BuiltinMemberType | (string & {});

export const BUILTIN_TEAM_GROUPS = ["development", "marketing", "sales"] as const;
export type BuiltinTeamGroup = (typeof BUILTIN_TEAM_GROUPS)[number];
/** Development, marketing, or a custom team added during registration. */
export type TeamGroup = BuiltinTeamGroup | (string & {});

/** A person who works for the company and can own projects or receive payroll. */
export interface CompanyMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  /** Display code such as ADM-001. Separate from the internal `id`. */
  employeeId?: string;
  /** e.g. Partner, Director, Developer, Operations */
  role?: string;
  memberType?: TeamMemberType;
  /** Development, marketing, or another working team. */
  teamGroup?: TeamGroup;
  joinDate?: string;
  status?: "active" | "inactive";
  /** Guaranteed monthly salary. Variable bonuses are recorded month by month. */
  baseMonthlySalary?: number;
  /** Maximum suggested bonus for a month; the actual bonus defaults to zero. */
  monthlyBonusCap?: number;
  /** Salary schedule start and due day. Missing start date means payroll has not begun. */
  salaryStartDate?: string;
  salaryDueDay?: number;
}

export type SalaryPaymentMode = "full" | "partial" | "extra";

/** One month of Team payroll — never written to the Accounts ledger. */
export interface SalaryMonthPayment {
  /** YYYY-MM */
  month: string;
  mode: SalaryPaymentMode;
  /** Salary portion actually paid this month. */
  salaryAmount: number;
  /** Extra / bonus paid this month. */
  bonusAmount?: number;
  note?: string;
}

/** Editable dropdown catalogs for expense/income forms (Settings → Form options). */
export interface FormOptionCatalogs {
  expenseCategories?: string[];
  incomeCategories?: string[];
  paymentMethods?: string[];
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
  /** Extra member types created from the Team form (beyond founder/employee/intern/contractor). */
  customMemberTypes?: string[];
  /** Extra working teams created from the Team form (beyond development/marketing). */
  customTeamGroups?: string[];
  /** Dropdown catalogs for expense/income forms — edited in Settings → Form options. */
  formOptions?: FormOptionCatalogs;
  /** One-time upgrade from the old partners-only list to the Team directory. */
  teamDirectoryMigrationApplied?: boolean;
  /** IDs of team members explicitly deleted by the user so migrations don't resurrect them. */
  deletedMemberIds?: string[];
  paymentTerms?: string;
  remarks?: string;
  paymentMode?: string;
  /** Whether receipt/proof uploads are shown in financial transaction forms. */
  paymentProofUploadsEnabled?: boolean;
  /** Feature flag for the unfinished Company Valuation module. */
  companyValuationEnabled?: boolean;
  /** Feature flag for Project Assignments (/team/assignments). Off until you need it. */
  projectAssignmentsEnabled?: boolean;
  /** Feature flag for Partnerships (/partnerships) nav + page. Off until you need it. */
  partnershipsEnabled?: boolean;
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
  /** CRM lead that owns this discussion/delivery project (one primary project per lead). */
  leadId?: string;
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
  /** Client created/activated when this lead was Won. */
  convertedClientId?: string;
  createdAt?: string;
  /**
   * Soft-removed from the Kanban board. Archived deals stay in `ops.leads` so
   * win/lost history and average deal size keep counting them. Projects are never
   * deleted when a lead is archived.
   */
  archivedAt?: string;
}

/** Directory contact — a saved person. Promoting to Leads keeps them here for repeat deals. */
export interface Contact {
  id: string;
  organizationId?: string;
  personName: string;
  companyName?: string;
  phone?: string;
  email?: string;
  /** Job title / role (CEO, Sales Manager, …). */
  designation?: string;
  /** Who to reach them through when there's no direct phone. */
  contactVia?: string;
  /** Business sector (tourism, real estate, …) — shown as Type / used to filter. */
  sector?: string;
  /** Manual tracking — whether this contact was reached. */
  contacted?: boolean;
  /** True after a sales-portal win is recorded (hidden from Contacted until reverted). */
  salesWon?: boolean;
  createdAt?: string;
}

/**
 * Imported Lead List row (Inner Circle / Excel intelligence) — separate from Pipeline CRM leads.
 * Upsert key for re-uploads is `externalId` (e.g. IC-001).
 */
export interface LeadListEntry {
  id: string;
  organizationId?: string;
  /** Spreadsheet Lead ID (IC-001). */
  externalId: string;
  dateTime?: string;
  phone?: string;
  email?: string;
  title: string;
  oneLiner?: string;
  xFactor?: string;
  whatTheyWant?: string;
  platformModules?: string;
  technicalStack?: string;
  keyNotes?: string;
  engagementCommercial?: string;
  applicationRequirements?: string;
  applicationIncludes?: string;
  mostValuableProof?: string;
  frameExpertiseAround?: string;
  intent?: string;
  urgency?: string;
  closeWindow?: string;
  competition?: string;
  projectType?: string;
  complexity?: string;
  engagementType?: string;
  focus?: string;
  category?: string;
  location?: string;
  informationLevel?: string;
  websiteStatus?: string;
  growthPath?: string;
  techFocus?: string;
  keyDifferentiator?: string;
  decisionDriver?: string;
  leadScore?: number;
  redFlags?: string;
  howToWin?: string;
  angle?: string;
  whyScore?: string;
  strategicInsight?: string;
  excellentFit?: string;
  poorFit?: string;
  finalAssessment?: string;
  fullOriginal?: string;
  /** Manual tracking — whether this lead was contacted. */
  contacted?: boolean;
  /** True after a sales-portal win is recorded (hidden from Contacted until reverted). */
  salesWon?: boolean;
  /** When this row was last imported/updated from Excel. */
  importedAt: string;
  sourceFileName?: string;
}

/** Category bucket for the internal credentials vault. */
export type CredentialCategory =
  | "Email"
  | "Social"
  | "Domain"
  | "Cloud"
  | "Development"
  | "Hosting"
  | "Database"
  | "Other";

/**
 * Company login / recovery entry — emails, service passwords, OTP phones.
 * Visible only after app gate login; treat like other solo-ops secrets.
 */
export interface CredentialEntry {
  id: string;
  organizationId?: string;
  category: CredentialCategory;
  service: string;
  email?: string;
  username?: string;
  password?: string;
  /** Phone / email / authenticator linked for OTP recovery. */
  linkedTo?: string;
  otpMethod?: string;
  notes?: string;
  updatedAt: string;
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

export type ScheduleEventType = "meeting" | "call" | "reminder";
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
  /**
   * Uploaded Lead List (e.g. Inner Circle Excel) — intelligence roster, not the Pipeline Kanban.
   */
  leadList?: LeadListEntry[];
  /**
   * Internal credentials vault — emails, logins, and recovery contacts for company services.
   */
  credentials?: CredentialEntry[];
  payments?: Payment[];
  transactions?: Transaction[];
  founders?: Founder[];
  /** Office & Ops — per-project commission splits (fixed ₹). */
  projectCommissions?: ProjectCommission[];
  notifications?: AppNotification[];
  /** Notification ids the user cleared — sync must not resurrect them. */
  dismissedNotificationIds?: string[];
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
  /** One-time repair: restored Kapila retainer identity + historical ₹10k received. */
  kapilaRetainerRepairApplied?: boolean;
  /** One-time repair: aligned Rent Management contract billing to the locked ₹80k total. */
  rentManagementContractRepairApplied?: boolean;
  /** One-time: +₹2,000 historical company expense so Revenue − Expenses matches cash. */
  historicalExpenseReconciliationApplied?: boolean;
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
  /** Optional custom display name for transaction type (e.g. Sponsorship, Royalty, Consulting). */
  customType?: string;
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

export type OpsBillingCycle = "monthly" | "yearly";

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
  /** Full obligation / loan principal (e.g. laptop EMI total). */
  totalAmount?: number;
  /** Installments already paid before tracking started in Ops. */
  priorPaidInstallments?: number;
  /** Rupees already paid toward totalAmount before tracking (preferred for EMI). */
  priorPaidAmount?: number;
  /** Calendar day (1–31) to remind the user each month. */
  reminderDay?: number;
  /** Checked-off installment months, stored as YYYY-MM. Kept in sync with `monthPayments`. */
  paidMonths?: string[];
  /** Amount-aware Team payroll records. Source of truth for salary ticks. */
  monthPayments?: SalaryMonthPayment[];
  /** Explicit workflow state; `active` remains for backwards compatibility. */
  status?: "active" | "paused" | "completed";
  notes?: string;
  active: boolean;
  /** Next bill or domain expiry (YYYY-MM-DD) — Office & Ops renewals. */
  nextDueDate?: string;
  /** How often this renews; domains are often yearly. */
  billingCycle?: OpsBillingCycle;
  /** Provider / registrar (AWS, Cursor, GoDaddy, etc.). */
  vendor?: string;
}

/** Per-person split on a project commission plan (Office & Ops). */
export interface ProjectCommissionSplit {
  id: string;
  personName: string;
  teamMemberId?: string;
  amount: number;
  notes?: string;
}

export type ProjectCommissionStatus = "planned" | "partial" | "paid";

/** Project commission plan — fixed ₹ splits; does not alter project billing maths. */
export interface ProjectCommission {
  id: string;
  projectId: string;
  label?: string;
  splits: ProjectCommissionSplit[];
  status: ProjectCommissionStatus;
  paidAt?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
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

export type DocumentLibrary = "preclient" | "proposals" | "quotations" | "client" | "vault";

export type ArchiveDocumentType =
  | "proposal"
  | "quotation"
  | "agreement"
  | "technical"
  | "handover"
  | "write_off"
  | "annexure"
  | "other";

/** User-uploaded file in the Documents folder vault. */
export interface ArchiveDocument {
  id: string;
  organizationId?: string;
  title: string;
  documentType: ArchiveDocumentType;
  customType?: string;
  /** Which top-level folder this file lives in. Inferred for older rows. */
  library?: DocumentLibrary;
  /** Grouping name in Proposals/Quotations; also used after Proceed. */
  companyName?: string;
  /** Set only after Proceed (client folder). Optional on pre-client uploads. */
  clientId?: string;
  /** @deprecated Prefer `companyName`; kept for older saved rows. */
  clientName?: string;
  /** Optional project tag inside a client folder. */
  projectId?: string;
  /** Team member ids this file is assigned to (client-folder files). */
  assignedMemberIds?: string[];
  fileDataUrl?: string;
  fileName?: string;
  mimeType?: string;
  externalUrl?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

/** Unified document archive metadata. Generated invoices remain in the invoice store. */
export interface DocumentsData {
  agreements: Agreement[];
  archiveDocuments: ArchiveDocument[];
}

export type ActivityEntity =
  | "project"
  | "partnership"
  | "expense"
  | "invoice"
  | "settings"
  | "agreement"
  | "document"
  | "security"
  | "lead";

export type ActivityAction =
  | "created"
  | "updated"
  | "deleted"
  | "payment_added"
  | "payment_removed"
  | "login"
  | "logout"
  | "failed_login"
  | "password_change";

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
  /** Canonical source links; Agreement remains optional. */
  projectId?: string;
  agreementId?: string;
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
