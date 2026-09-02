import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DigestItemSchema } from "../src/lib/digestSchema.js";

// Mirrors the glob loader configured in src/content.config.ts:
//   glob({ pattern: "**/*.json", base: "./src/data/digest" })
// This test replicates that exact pattern/base at the filesystem level
// (recursive JSON discovery + JSON.parse + schema validation) instead of
// importing astro:content directly. Doing the equivalent work directly in
// Vitest proves the collection will load and validate correctly at build
// time, without needing Astro's Vitest container-API test setup — real,
// but heavier infrastructure than this test needs.
const DIGEST_BASE = join(import.meta.dirname, "..", "src", "data", "digest");

function findJsonFiles(base: string): string[] {
  return readdirSync(base, { recursive: true })
    .filter((entry) => typeof entry === "string" && entry.endsWith(".json"))
    .map((entry) => join(base, entry as string));
}

describe("digest content collection (glob loader equivalent)", () => {
  const jsonFiles = findJsonFiles(DIGEST_BASE);

  it("finds at least one digest JSON file (the collection is not empty)", () => {
    expect(jsonFiles.length).toBeGreaterThan(0);
  });

  it("parses every digest file as valid JSON and validates against DigestItemSchema with zero errors", () => {
    for (const filePath of jsonFiles) {
      const raw = readFileSync(filePath, "utf-8");

      let parsedJson: unknown;
      expect(() => {
        parsedJson = JSON.parse(raw);
      }, `${filePath} should parse as valid JSON`).not.toThrow();

      const result = DigestItemSchema.safeParse(parsedJson);
      expect(
        result.success,
        result.success
          ? undefined
          : `${filePath} failed schema validation: ${JSON.stringify(result.error?.issues)}`,
      ).toBe(true);
    }
  });
});
