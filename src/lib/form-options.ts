import type { CompanySettings, FormOptionCatalogs } from "./types";

export const DEFAULT_EXPENSE_CATEGORIES = [
  "Hosting",
  "Software",
  "Salary",
  "Travel",
  "Marketing",
  "Office",
  "Internet",
  "Legal",
  "GST",
  "Food",
  "Utilities",
  "Miscellaneous",
] as const;

export const DEFAULT_INCOME_CATEGORIES = [
  "Client Income",
  "Reimbursement",
  "Founder Investment",
  "Refund Received",
  "Other Income",
] as const;

export const DEFAULT_PAYMENT_METHODS = [
  "UPI (GPay / PhonePe / Paytm)",
  "Bank Transfer (NEFT / IMPS / RTGS)",
  "Cash",
  "Cheque",
  "Other",
] as const;

/** Older forms stored machine codes; map them to catalog labels. */
const LEGACY_PAYMENT_METHOD_LABELS: Record<string, string> = {
  upi: "UPI (GPay / PhonePe / Paytm)",
  bank_transfer: "Bank Transfer (NEFT / IMPS / RTGS)",
  cash: "Cash",
  cheque: "Cheque",
  other: "Other",
};

/** Built-in team roles — always available; extras live in customMemberTypes. */
export const BUILTIN_MEMBER_TYPE_LABELS = [
  "Founder / Partner",
  "Employee",
  "Intern",
  "Contractor",
] as const;

function cleanList(values: string[] | readonly string[] | undefined | null): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values ?? []) {
    const value = raw.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

export function normalizeFormOptions(
  raw: FormOptionCatalogs | undefined | null,
): Required<FormOptionCatalogs> {
  return {
    expenseCategories: cleanList(raw?.expenseCategories).length
      ? cleanList(raw?.expenseCategories)
      : [...DEFAULT_EXPENSE_CATEGORIES],
    incomeCategories: cleanList(raw?.incomeCategories).length
      ? cleanList(raw?.incomeCategories)
      : [...DEFAULT_INCOME_CATEGORIES],
    paymentMethods: cleanList(raw?.paymentMethods).length
      ? cleanList(raw?.paymentMethods)
      : [...DEFAULT_PAYMENT_METHODS],
  };
}

export function expenseCategoriesFor(company?: CompanySettings | null): string[] {
  return normalizeFormOptions(company?.formOptions).expenseCategories;
}

export function incomeCategoriesFor(company?: CompanySettings | null): string[] {
  return normalizeFormOptions(company?.formOptions).incomeCategories;
}

export function paymentMethodLabelsFor(company?: CompanySettings | null): string[] {
  return normalizeFormOptions(company?.formOptions).paymentMethods;
}

/** Match a stored category to the catalog (case-insensitive); keep unknown labels as-is. */
export function matchCatalogCategory(
  raw: string | undefined,
  catalog: string[],
): string {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return "";
  return catalog.find((cat) => cat.toLowerCase() === trimmed.toLowerCase()) ?? trimmed;
}

/** Resolve stored payment method (legacy code or label) to a catalog entry when possible. */
export function resolvePaymentMethodLabel(
  stored: string | undefined,
  catalog: string[],
): string {
  const trimmed = stored?.trim() ?? "";
  if (!trimmed) {
    return (
      catalog.find((label) => label.toLowerCase().includes("bank transfer")) ??
      catalog[0] ??
      DEFAULT_PAYMENT_METHODS[1]
    );
  }
  const asLabel = LEGACY_PAYMENT_METHOD_LABELS[trimmed] ?? trimmed;
  return catalog.find((label) => label.toLowerCase() === asLabel.toLowerCase()) ?? asLabel;
}

export type FormOptionListKey = keyof Required<FormOptionCatalogs>;

export const FORM_OPTION_LISTS: {
  key: FormOptionListKey;
  title: string;
  description: string;
}[] = [
  {
    key: "expenseCategories",
    title: "Expense categories",
    description: "Shown when logging business expenses (Travel, Office, Rent, …).",
  },
  {
    key: "incomeCategories",
    title: "Income categories",
    description: "Labels for money in (Client Income, Reimbursement, …).",
  },
  {
    key: "paymentMethods",
    title: "Payment methods",
    description: "How money was paid or received.",
  },
];
