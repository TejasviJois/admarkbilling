import type { Lead } from "./types";

export const DEFAULT_LEADS: Lead[] = [
  { id: "lead-shudhindra", name: "Shudhindra", business: "Inventory — Farma", company: "Inventory — Farma", contactPerson: "Shudhindra", status: "new_lead" },
  { id: "lead-vivek-kotari", name: "Vivek Kotari", business: "WhatsApp — Hardware", company: "WhatsApp — Hardware", contactPerson: "Vivek Kotari", status: "new_lead" },
  { id: "lead-suresh-stocks", name: "Suresh Stocks", business: "WhatsApp — FnQ", company: "WhatsApp — FnQ", contactPerson: "Suresh Stocks", status: "new_lead" },
  { id: "lead-mahaveer", name: "Mahaveer", business: "WhatsApp — Detailing Mafia", company: "WhatsApp — Detailing Mafia", contactPerson: "Mahaveer", status: "new_lead" },
  { id: "lead-omg-clothing", name: "OMG Clothing", business: "Farm stay and clothing", company: "Farm stay and clothing", contactPerson: "OMG Clothing", status: "new_lead" },
  { id: "lead-advik", name: "Advik", business: "WhatsApp and inventory farm stay", company: "WhatsApp and inventory farm stay", contactPerson: "Advik", status: "new_lead" },
  { id: "lead-paras", name: "Paras", business: "Farm stay & hoarding company", company: "Farm stay & hoarding company", contactPerson: "Paras", status: "new_lead" },
  { id: "lead-sanjana-kajol", name: "Sanjana Kajol", business: "Marketing person", company: "Marketing person", contactPerson: "Sanjana Kajol", status: "new_lead" },
  { id: "lead-indo-pest", name: "Indo Pest Control", business: "WhatsApp", company: "WhatsApp", contactPerson: "Indo Pest Control", status: "new_lead" },
  { id: "lead-tirtha", name: "Tirtha", business: "Dealer PC — WhatsApp", company: "Dealer PC — WhatsApp", contactPerson: "Tirtha", status: "new_lead" },
  { id: "lead-amir-suhali", name: "Amir Suhali", business: "False ceiling — WhatsApp", company: "False ceiling — WhatsApp", contactPerson: "Amir Suhali", status: "new_lead" },
  {
    id: "lead-pawan-canteen",
    name: "Pawan Canteen",
    business: "Real estate and canteen",
    company: "Real estate and canteen",
    contactPerson: "Pawan Canteen",
    status: "new_lead",
  },
  {
    id: "lead-bg-stones",
    name: "BG Stones",
    business: "Think and tell what can be done",
    company: "Think and tell what can be done",
    contactPerson: "BG Stones",
    status: "new_lead",
  },
  { id: "lead-shlokh", name: "Shlokh", business: "Events", company: "Events", contactPerson: "Shlokh", status: "new_lead" },
  { id: "lead-vivek-chirag", name: "Vivek", business: "Chirag Ads", company: "Chirag Ads", contactPerson: "Vivek", status: "new_lead" },
  {
    id: "lead-nisar",
    name: "Nisar",
    business: "World Air",
    company: "World Air",
    contactPerson: "Nisar",
    phone: "8921379419",
    status: "new_lead",
  },
  {
    id: "lead-kiran",
    name: "Kiran",
    business: "Vibha Tours",
    company: "Vibha Tours",
    contactPerson: "Kiran",
    phone: "8971920816",
    status: "new_lead",
  },
];

export function needsLeadSeed(leads: Lead[] | undefined): boolean {
  // Seed only a brand-new install — deliberate deletions must never resurrect defaults.
  return leads === undefined;
}

export function withDefaultLeads<T extends { leads?: Lead[] }>(data: T): T {
  if (!needsLeadSeed(data.leads)) return data;
  return { ...data, leads: DEFAULT_LEADS };
}
