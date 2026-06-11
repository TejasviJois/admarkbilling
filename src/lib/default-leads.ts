import type { Lead } from "./types";

export const DEFAULT_LEADS: Lead[] = [
  { id: "lead-shudhindra", name: "Shudhindra", business: "Inventory — Farma", status: "new" },
  { id: "lead-vivek-kotari", name: "Vivek Kotari", business: "WhatsApp — Hardware", status: "new" },
  { id: "lead-suresh-stocks", name: "Suresh Stocks", business: "WhatsApp — FnQ", status: "new" },
  { id: "lead-mahaveer", name: "Mahaveer", business: "WhatsApp — Detailing Mafia", status: "new" },
  { id: "lead-omg-clothing", name: "OMG Clothing", business: "Farm stay and clothing", status: "new" },
  { id: "lead-advik", name: "Advik", business: "WhatsApp and inventory farm stay", status: "new" },
  { id: "lead-paras", name: "Paras", business: "Farm stay & hoarding company", status: "new" },
  { id: "lead-sanjana-kajol", name: "Sanjana Kajol", business: "Marketing person", status: "new" },
  { id: "lead-indo-pest", name: "Indo Pest Control", business: "WhatsApp", status: "new" },
  { id: "lead-tirtha", name: "Tirtha", business: "Dealer PC — WhatsApp", status: "new" },
  { id: "lead-amir-suhali", name: "Amir Suhali", business: "False ceiling — WhatsApp", status: "new" },
  {
    id: "lead-pawan-canteen",
    name: "Pawan Canteen",
    business: "Real estate and canteen",
    status: "new",
  },
  {
    id: "lead-bg-stones",
    name: "BG Stones",
    business: "Think and tell what can be done",
    status: "new",
  },
  { id: "lead-shlokh", name: "Shlokh", business: "Events", status: "new" },
  { id: "lead-vivek-chirag", name: "Vivek", business: "Chirag Ads", status: "new" },
  {
    id: "lead-nisar",
    name: "Nisar",
    business: "World Air",
    phone: "8921379419",
    status: "new",
  },
  {
    id: "lead-kiran",
    name: "Kiran",
    business: "Vibha Tours",
    phone: "8971920816",
    status: "new",
  },
];

export function needsLeadSeed(leads: Lead[] | undefined): boolean {
  if (!leads || leads.length === 0) return true;
  return !leads.some((l) => l.id === "lead-shudhindra");
}

export function withDefaultLeads<T extends { leads?: Lead[] }>(data: T): T {
  if (!needsLeadSeed(data.leads)) return data;
  return { ...data, leads: DEFAULT_LEADS };
}
