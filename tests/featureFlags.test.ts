import { describe, expect, it } from "vitest";
import { isFlagEnabled } from "../src/lib/featureFlags.js";

describe("isFlagEnabled", () => {
  it('(regression) treats Vite\'s coerced real boolean true as enabled, not just the literal string "true"', () => {
    // Confirmed directly against a real dev server: ENABLE_DEV_MODE=true
    // resolves to the real boolean `true` via import.meta.env, not the
    // string "true" - a naive `value === 'true'` check silently never
    // matched this real shape, and the skin-toggle feature flag appeared
    // to always be off even with the env var correctly set.
    expect(isFlagEnabled(true)).toBe(true);
  });

  it('treats the literal string "true" as enabled too', () => {
    expect(isFlagEnabled("true")).toBe(true);
  });

  it("treats false, undefined, and other strings as disabled", () => {
    expect(isFlagEnabled(false)).toBe(false);
    expect(isFlagEnabled(undefined)).toBe(false);
    expect(isFlagEnabled("false")).toBe(false);
    expect(isFlagEnabled("")).toBe(false);
  });
});
