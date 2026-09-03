// PRECONDITION: e2e-style test reading already-built output — run `npm run
// build` first. Matches tests/build-output.test.ts's convention.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { DigestItemSchema } from "../src/lib/digestSchema.js";

const DIST_LATEST_JSON = join(import.meta.dirname, "..", "dist", "latest.json");

let raw: string;

beforeAll(() => {
  if (!existsSync(DIST_LATEST_JSON)) {
    throw new Error("dist/latest.json not found — run `npm run build` first.");
  }
  raw = readFileSync(DIST_LATEST_JSON, "utf-8");
});

describe("dist/latest.json", () => {
  it("is valid JSON containing a real array of items", () => {
    const parsed = JSON.parse(raw);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
  });

  it("every item validates against DigestItemSchema", () => {
    const parsed = JSON.parse(raw);
    for (const item of parsed) {
      expect(() => DigestItemSchema.parse(item)).not.toThrow();
    }
  });
});
