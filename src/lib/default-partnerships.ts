import type { Partnership, PartnershipStatus } from "./types";

function part(
  id: string,
  name: string,
  type: string,
  status: PartnershipStatus,
  opportunityType: string,
): Partnership {
  return { id, name, type, status, opportunityType };
}

/** Admark partner pipeline — seeded when partnerships list is empty or outdated. */
export const DEFAULT_PARTNERSHIPS: Partnership[] = [
  part("part-epixable", "Epixable", "Marketing Agency", "active", "Project Based"),
  part("part-heat-wave-media", "Heat Wave Media", "Marketing Agency", "active", "Project Based"),
  part(
    "part-a7-global-tech",
    "A7 Global Tech LLP",
    "Development Agency",
    "active",
    "Hourly-based & Project Based",
  ),
  part(
    "part-jackfruit",
    "Jackfruit Technologies",
    "Development Agency",
    "active",
    "Hourly-based & Project Based",
  ),
  part("part-dronark-pungi", "Dronark - Pungi", "Marketing Agency", "active", "Project Based"),
  part("part-abhishek-agency", "Abhishek Agency", "Marketing Agency", "active", "Project Based"),
  part(
    "part-win-research",
    "Win Research Center",
    "Development Agency",
    "prospect",
    "Project Based",
  ),
  part("part-pixel-geek", "Pixel Geek", "Marketing Agency", "prospect", "Project Based"),
  part("part-zach-poland", "Zach (Poland)", "International Sales", "inactive", "Project Based"),
  part(
    "part-rajans-poorvik",
    "Rajans Poorvik Media",
    "Marketing/Media",
    "inactive",
    "Project Based",
  ),
  part(
    "part-megha-signs",
    "Megha Signs Kodagu",
    "Marketing Agency",
    "inactive",
    "Project Based",
  ),
  part("part-4am-media", "4AM Media", "Marketing Agency", "inactive", "Project Based"),
  part("part-sparkling-ads", "Sparkling Ads", "Marketing Agency", "inactive", "Project Based"),
];

export function withDefaultPartnerships<T extends { partnerships: Partnership[] }>(data: T): T {
  if (data.partnerships.length > 0) return data;
  return { ...data, partnerships: DEFAULT_PARTNERSHIPS };
}

export function partnershipStatusLabel(status: PartnershipStatus): string {
  switch (status) {
    case "active":
      return "Confirmed";
    case "prospect":
      return "Warm";
    case "inactive":
      return "Not interested";
    default:
      return status;
  }
}
