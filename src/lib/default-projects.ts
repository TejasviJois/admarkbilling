import type { Project, ProjectBilling, ProjectStatus } from "./types";

function p(
  id: string,
  client: string,
  projectType: string,
  status: ProjectStatus,
  revenueValue: string,
  paymentStatus?: string,
  billing?: ProjectBilling,
): Project {
  return {
    id,
    client,
    name: client,
    projectType,
    status,
    revenueValue,
    billing,
    paymentStatus: paymentStatus && paymentStatus !== "-" ? paymentStatus : undefined,
  };
}

/** Admark project pipeline — seeded when no projects exist yet. */
export const DEFAULT_PROJECTS: Project[] = [
  p("proj-kapila-faq", "Kapila FAQ", "Watsapp Bot", "completed", "Partner - Discount"),
  p("proj-mtm-faq", "MTM FAQ", "Watsapp Bot", "completed", "Partner - Discount"),
  p("proj-rls-p", "RLS P", "Website", "completed", "₹24,000", "Done"),
  p("proj-tah", "TAH", "Website + Billing System", "active", "₹70,000 + ₹1K/month", "₹21,000 Received", {
    upfrontAmount: 70_000,
    monthlyAmount: 1_000,
  }),
  p(
    "proj-kannan",
    "Kannan Sirangapalli",
    "Inventory System (Meeting)",
    "active",
    "₹1,40,000 + ₹8K/month",
    "₹30,000 Received",
    { upfrontAmount: 140_000, monthlyAmount: 8_000 },
  ),
  p("proj-kapila-mgmt", "Kapila Management Software", "Dashboard", "active", "₹10,000/month", undefined, {
    monthlyAmount: 10_000,
  }),
  p("proj-a7-gtech", "A7 Gtech - 2 Hostings", "Per Project", "active", "₹12,425 - Total", "Done"),
  p("proj-royal-passage", "Royal Passage", "Website", "active", "Partner - Discount"),
  p("proj-safe-wheels", "Safe Wheels", "Dashboard", "active", "₹20,000/month", undefined, {
    monthlyAmount: 20_000,
  }),
  p("proj-spice-trip", "Spice Trip", "Dashboard", "active", "₹10,000/month", undefined, {
    monthlyAmount: 10_000,
  }),
  p("proj-heatwave", "HeatWave", "Website", "active", "TBD"),
  p("proj-dev", "Dev", "CRM", "active", "₹60,000 project + ₹7,000/month maintenance for 2 months", "5,000 token", {
    upfrontAmount: 60_000,
    maintenanceAmount: 14_000,
    maintenanceMonths: 2,
  }),
  p("proj-kh-kiran", "k h kiran", "Real estate", "active", "₹20,000 for 3 months", "10,000 advance", {
    maintenanceAmount: 20_000,
    maintenanceMonths: 3,
  }),
  p("proj-towell", "Towell", "ALL AI", "planning", "TBD"),
  p("proj-texa", "Texa", "Tech & Marketing", "planning", "TBD"),
  p("proj-powergate", "Powergate energy", "WhatsApp Automation", "planning", "TBD", "Send Doc"),
  p("proj-vintage", "Vintage", "2 Websites", "planning", "₹24,000"),
  p("proj-motosouls", "Motosouls", "Inventory System", "planning", "₹105,000"),
  p("proj-world-air", "World Air", "CRM", "planning", "₹190,000 + ₹7K/month", "15/16"),
  p(
    "proj-nagendra",
    "Nagendra - hyd balaji",
    "Warehouse & Fleet manage",
    "planning",
    "TBD",
    "15/16",
  ),
  p("proj-suhalya", "Suhalya Travels", "Custom software", "planning", "TBD", "21/22"),
  p("proj-gokashi", "GoKashi", "Custom software", "planning", "TBD", "16/17"),
  p(
    "proj-alliance-square",
    "Alliance Square",
    "Property Listing",
    "on_hold",
    "₹5,50,000 + ₹30K - ₹1L/month",
  ),
  p("proj-health-wealth", "health wealth", "Marketing", "on_hold", "TBD"),
  p("proj-cafe-chintu", "Cafe - Chintu Friend", "Basic Billing", "on_hold", "₹30,000 + ₹1.5K/month"),
  p("proj-epixable", "Epixable (Hospital)", "Booking System (SaaS/Web App)", "on_hold", "TBD"),
  p("proj-panche-kattu", "Panche Kattu", "Inventory System (Meeting)", "on_hold", "TBD"),
  p(
    "proj-pawan-krishna",
    "Pawan Refer - Krishna",
    "WhatsApp Automation",
    "cancelled",
    "₹14,000 + ₹3.5K/month",
  ),
  p("proj-ss-foundation", "SS Foundation", "WebApp", "cancelled", "₹1,80,000"),
  p(
    "proj-sublime-camps",
    "Sublime Camps",
    "Website + WhatsApp Automation",
    "cancelled",
    "₹27,000 + ₹2K/month",
  ),
  p("proj-jayanth-paint", "Jayanth - Paint", "Tech & Marketing", "cancelled", "TBD"),
];

export function withDefaultProjects<T extends { projects: Project[] }>(data: T): T {
  if (data.projects.length > 0) return data;
  return { ...data, projects: DEFAULT_PROJECTS };
}
