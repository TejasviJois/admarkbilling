import type { CompanySettings } from "./types";

import admarkDigitalsLogoUrl from "../assets/admark-digitals-logo.png?url";

/** Bundled logo (header, preview, PDF when no custom upload). Matches `src/assets/admark-digitals-logo.png`. */
export const DEFAULT_PUBLIC_LOGO_URL = admarkDigitalsLogoUrl;

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
  name: "Admark",
  tagline: "Creative · Web · Branding",
  address: "Hyderabad, Telangana, India",
  email: "hello@admark.in",
  phone: "",
  pan: "",
  gstin: "",
  bankName: "Karnataka Bank",
  accountName: "Tejasvi Jois S",
  accountNumber: "5192500101932301",
  ifsc: "KARB0000519",
  branch: "",
  upi: "",
  authorizedName: "Authorized Signatory",
  companyMembers: [
    {
      id: "member-harshith",
      name: "Harshith V Malipatil",
      email: "malipatilharshith@gmail.com",
      phone: "+91 9632092273",
    },
    {
      id: "member-prajwal",
      name: "Prajwal BP",
      email: "prajwalbp500@gmail.com",
      phone: "+91 7259588826",
    },
    {
      id: "member-tejasvi",
      name: "Tejasvi Jois",
      email: "tejasvijois@gmail.com",
      phone: "+91 9686658055",
    },
    {
      id: "member-revanth",
      name: "Revanth Kumar S",
      email: "revanthkumars64@gmail.com",
      phone: "+91 8431005243",
    },
  ],
};
