import { describe, expect, it } from "vitest";
import { interestTier } from "../src/lib/interestTier.js";

describe("interestTier", () => {
  it("returns 'notable' for scores below 6", () => {
    expect(interestTier(0)).toBe("notable");
    expect(interestTier(5.9)).toBe("notable");
  });

  it("returns 'recommended' for scores 6 up to (not including) 8", () => {
    expect(interestTier(6)).toBe("recommended");
    expect(interestTier(7.9)).toBe("recommended");
  });

  it("returns 'must-read' for scores 8 and above", () => {
    expect(interestTier(8)).toBe("must-read");
    expect(interestTier(10)).toBe("must-read");
  });
});
