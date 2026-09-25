import type { CompanySettings } from "./types";

import admarkDigitalsLogoUrl from "../assets/admark-digitals-logo.png?url";
import admarkLetterheadUrl from "../assets/admark-letterhead.png?url";

/** Static public copy — PDF fetch fallback and apple-touch-icon. */
export const DEFAULT_PUBLIC_LOGO_PATH = "/admark-default-logo.png";

/** Bundled logo (header, preview, PDF when no custom upload). Matches `src/assets/admark-digitals-logo.png`. */
export const DEFAULT_PUBLIC_LOGO_URL = admarkDigitalsLogoUrl;

/** Invoice letterhead — PNG render of bundled PDF (`src/assets/admark-letterhead.pdf`). */
export const DEFAULT_LETTERHEAD_URL = admarkLetterheadUrl;
export const DEFAULT_LETTERHEAD_PDF_PATH = "/admark-letterhead.pdf";

/** Bundled Udyam / MSME certificate (`public/admark-udyam-certificate.pdf`; source: `src/assets/ADMARK UDYAM CERTIFICATE.pdf`). */
export const DEFAULT_UDYAM_CERTIFICATE_URL = "/admark-udyam-certificate.pdf";

/** Public company website — shown on downloaded invoices (clickable in PDF). */
export const COMPANY_WEBSITE_URL = "https://admarkdigitals.com/";

/**
 * “Home” in the app shell — defaults to this app’s root (`/`).
 * Set `VITE_PUBLIC_HOME_URL` to an absolute URL (e.g. marketing site) only if Home should leave the app.
 */
export const PUBLIC_HOME_URL: string =
  (import.meta.env.VITE_PUBLIC_HOME_URL as string | undefined)?.trim() || "/";

export const DEFAULT_COMPANY: CompanySettings = {
  name: "Admark Digitals",
  tagline: "",
  address: "CH-16 4TH MAIN, 5TH CROSS GROUND FLOOR, PRASHANTH PLAZA, SARASWATHIPURAM MYSORE",
  email: "info@admarkdigitals.com",
  phone: "+91 9686658055",
  website: COMPANY_WEBSITE_URL,
  pan: "",
  gstin: "",
  bankName: "",
  accountName: "",
  accountNumber: "",
  ifsc: "",
  branch: "",
  upi: "",
  authorizedName: "Authorized Signatory",
  paymentTerms: "50% at project start; remaining 50% before deployment.",
  remarks: "Thank you for your business!",
  paymentMode: "Bank Transfer / UPI",
  paymentProofUploadsEnabled: false,
  companyValuationEnabled: false,
  projectAssignmentsEnabled: false,
  partnershipsEnabled: false,
  companyMembers: [
    {
      id: "member-harshith",
      name: "Harshith V Malipatil",
      email: "",
      phone: "",
      employeeId: "ADM-002",
      role: "Partner",
      memberType: "founder",
      status: "active",
    },
    {
      id: "member-prajwal",
      name: "Prajwal BP",
      email: "",
      phone: "",
      employeeId: "ADM-004",
      role: "Partner",
      memberType: "founder",
      status: "active",
    },
    {
      id: "member-tejasvi",
      name: "Tejasvi Jois",
      email: "",
      phone: "",
      employeeId: "ADM-001",
      role: "Partner",
      memberType: "founder",
      status: "active",
    },
    {
      id: "member-revanth",
      name: "Revanth Kumar S",
      email: "",
      phone: "",
      employeeId: "ADM-003",
      role: "Partner",
      memberType: "founder",
      status: "active",
    },
    {
      id: "member-chetan",
      name: "Chetan",
      email: "",
      phone: "",
      employeeId: "ADM-005",
      role: "Intern",
      memberType: "intern",
      status: "active",
    },
    {
      id: "member-supreeth",
      name: "Supreeth",
      email: "",
      phone: "",
      employeeId: "ADM-006",
      role: "Intern",
      memberType: "intern",
      status: "active",
    },
  ],
};
