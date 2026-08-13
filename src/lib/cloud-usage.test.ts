import { describe, expect, it } from "vitest";
import { formatGbPair, usagePercent } from "./cloud-usage";

describe("cloud usage formatters", () => {
  it("formats database-style GB pairs like the Supabase dashboard", () => {
    expect(formatGbPair(0.032 * 1024 ** 3, 0.5 * 1024 ** 3)).toBe("0.032 / 0.5 GB (6%)");
    expect(formatGbPair(0.004 * 1024 ** 3, 1 * 1024 ** 3)).toBe("0.004 / 1 GB (<1%)");
  });

  it("clamps percent at 100", () => {
    expect(usagePercent(2, 1)).toBe(100);
    expect(usagePercent(0, 1)).toBe(0);
  });
});
