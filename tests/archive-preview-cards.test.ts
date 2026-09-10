import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { DigestItemSchema } from "../src/lib/digestSchema.js";
import { DIST_DIR, readAllPageCss } from "./testUtils.js";

const DIST_ARCHIVE_INDEX = join(DIST_DIR, "archive", "index.html");
const DIGEST_BASE = join(import.meta.dirname, "..", "src", "data", "digest");

// Real committed digest data can have a genuine tie at the top score
// (confirmed: a live 4-way tie on 2026-09-03, same class of issue
// build-output.test.ts's "marks the highest-scored story as the lead
// story" test already documents and works around). Array.sort is
// stable, so a tie's winner depends on each side's PRE-sort ordering -
// this test's own readdirSync-based file order and Astro's content-
// collection glob-loader order are not guaranteed to agree, so
// asserting one specific tied title is not a real requirement. The
// actual invariant DigestPreviewCard promises is "the lead card shows
// one of the highest-scored items for that date," not "this one
// specific title" - assert membership in the max-score set instead.
function readMaxScoreItemsForLatestDate() {
  const latestDate = readdirSync(DIGEST_BASE)
    .filter((entry) => existsSync(join(DIGEST_BASE, entry)))
    .sort()
    .at(-1) as string;
  const files = readdirSync(join(DIGEST_BASE, latestDate)).filter((f) =>
    f.endsWith(".json"),
  );
  const items = files.map((f) =>
    DigestItemSchema.parse(
      JSON.parse(readFileSync(join(DIGEST_BASE, latestDate, f), "utf-8")),
    ),
  );
  const maxScore = Math.max(...items.map((item) => item.interest_score));
  return {
    date: latestDate,
    maxScoreItems: items.filter((item) => item.interest_score === maxScore),
  };
}

let html: string;

beforeAll(() => {
  if (!existsSync(DIST_ARCHIVE_INDEX)) {
    throw new Error(
      "dist/archive/index.html not found - run `npm run build` first.",
    );
  }
  html = readFileSync(DIST_ARCHIVE_INDEX, "utf-8");
});

describe("archive preview cards", () => {
  it("(backlog) shows the lead story's real title and why_read excerpt for each date, not a bare link", () => {
    const { maxScoreItems } = readMaxScoreItemsForLatestDate();
    expect(maxScoreItems.length).toBeGreaterThan(0);

    const matchedTitle = maxScoreItems.find((item) =>
      html.includes(item.title),
    );
    expect(
      matchedTitle,
      `expected the archive index to show one of the top-scored titles: ${JSON.stringify(maxScoreItems.map((i) => i.title))}`,
    ).toBeTruthy();
    expect(html).toContain(matchedTitle!.why_read.slice(0, 40));
  });

  it("(backlog) still shows the real item count per date", () => {
    expect(html).toMatch(/\d+\s*items?/);
  });

  it("(audit fix) .preview-date has a :focus-visible rule matching the site's accent pattern", () => {
    const style = readAllPageCss(html);
    expect(style).toMatch(
      /\.preview-date(?:\[[^\]]*\])?:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/,
    );
  });

  it("(regression) sets height:auto on the preview image so aspect-ratio governs its box instead of the width/height HTML attributes", () => {
    // Real, screenshot-confirmed bug: the <img>'s width="320" height="180"
    // attributes (kept for CLS prevention) map to a fixed-pixel CSS
    // height presentational hint, which counts as an explicit height and
    // so wins over aspect-ratio's own auto-sizing. Confirmed live: a
    // real card at 1018px wide rendered its image at 1018x180 (5.6:1)
    // instead of the intended 16:9 box, and object-fit:cover then
    // cropped nearly all of the image's vertical content away. height:
    // auto restores aspect-ratio as the real source of truth.
    const style = readAllPageCss(html);
    const ruleMatch = style.match(
      /\.preview-image(?:\[[^\]]*\])?\s*\{([^}]*)\}/s,
    );
    expect(ruleMatch, "expected a .preview-image rule").toBeTruthy();
    const rule = ruleMatch![1];
    expect(rule).toMatch(/height:\s*auto/);
    expect(rule).toMatch(/aspect-ratio:\s*16\s*\/\s*9/);
  });
});
