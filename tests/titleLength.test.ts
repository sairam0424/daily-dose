import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MAX_SAFE_TITLE_LENGTH = 60;

const PAGES = [
  "src/pages/index.astro",
  "src/pages/methodology.astro",
  "src/pages/privacy.astro",
  "src/pages/stats.astro",
];

describe("page <title> length", () => {
  for (const pagePath of PAGES) {
    it(`${pagePath}'s title prop is at or under ${MAX_SAFE_TITLE_LENGTH} characters`, () => {
      const source = readFileSync(pagePath, "utf-8");
      const match = source.match(/title="([^"]+)"/);
      expect(match, `expected a title="..." prop in ${pagePath}`).toBeTruthy();
      expect(match![1].length).toBeLessThanOrEqual(MAX_SAFE_TITLE_LENGTH);
    });
  }
});
