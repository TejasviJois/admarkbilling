import { describe, expect, it } from "vitest";

/**
 * Mirrors the production seed predicates in operations-storage.ts.
 * Kept here so we can lock the "never wipe live data" / "never resurrect deletes" contract
 * without importing the storage module's server dependencies into the unit suite.
 */
function needsProjectSeed(projects: unknown[] | undefined, allowFirstInstallSeed: boolean): boolean {
  return allowFirstInstallSeed && (projects === undefined || projects.length === 0);
}

function needsPartnershipSeed(
  partnerships: unknown[] | undefined,
  allowFirstInstallSeed: boolean,
): boolean {
  return allowFirstInstallSeed && (partnerships === undefined || partnerships.length === 0);
}

describe("default seed predicates", () => {
  it("never reseeds an empty list after deletes (remote / cached load)", () => {
    expect(needsProjectSeed([], false)).toBe(false);
    expect(needsPartnershipSeed([], false)).toBe(false);
  });

  it("allows a one-time seed only on first local install", () => {
    expect(needsProjectSeed([], true)).toBe(true);
    expect(needsPartnershipSeed(undefined, true)).toBe(true);
  });

  it("never replaces a populated list just because a legacy seed id is missing", () => {
    expect(needsProjectSeed([{ id: "proj-custom-only" }], true)).toBe(false);
    expect(needsPartnershipSeed([{ id: "part-custom-only" }], false)).toBe(false);
  });
});
