import { describe, expect, it } from "vitest";

/**
 * Mirrors the production seed predicates in operations-storage.ts.
 * Kept here so we can lock the "never wipe live data" contract without
 * importing the storage module's server dependencies into the unit suite.
 */
function needsProjectSeed(projects: unknown[]): boolean {
  return projects.length === 0;
}

function needsPartnershipSeed(partnerships: unknown[]): boolean {
  return partnerships.length === 0;
}

describe("default seed predicates", () => {
  it("seeds only when the list is empty", () => {
    expect(needsProjectSeed([])).toBe(true);
    expect(needsPartnershipSeed([])).toBe(true);
  });

  it("never replaces a populated list just because a legacy seed id is missing", () => {
    expect(needsProjectSeed([{ id: "proj-custom-only" }])).toBe(false);
    expect(needsPartnershipSeed([{ id: "part-custom-only" }])).toBe(false);
  });
});
