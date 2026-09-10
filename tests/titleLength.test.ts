import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildArchiveDateTitle } from "../src/lib/leadTitle.js";

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

// src/pages/archive/[date].astro's title prop is a dynamic template
// literal (`buildArchiveDateTitle(date, leadEntry.data.title)`), not a
// literal title="..." string the PAGES loop above can match - it's
// exercised directly against the same real, unbounded lead-title data
// shape the page itself receives, covering both a short real lead title
// and a real long one that would blow past MAX_SAFE_TITLE_LENGTH if the
// page reused the (much looser) meta-description truncation budget
// verbatim instead of a <title>-tag-specific one.
describe("archive/[date].astro's dynamic per-date <title>", () => {
  it("stays at or under 60 characters for a short real lead title", () => {
    const title = buildArchiveDateTitle(
      "2026-09-09",
      "openai/NavierStokesAndEuler",
    );
    expect(title.length).toBeLessThanOrEqual(MAX_SAFE_TITLE_LENGTH);
  });

  it("stays at or under 60 characters for a real, long lead title", () => {
    // A real committed lead title from this session (2026-09-07's top
    // arXiv paper) - 107 characters.
    const realLongLeadTitle =
      "Same Trajectory, Contradictory Rewards (ROBORMBENCH): Paraphrase Fragility in Vision Language Reward Models";
    const title = buildArchiveDateTitle("2026-09-07", realLongLeadTitle);
    expect(title.length).toBeLessThanOrEqual(MAX_SAFE_TITLE_LENGTH);
  });
});
