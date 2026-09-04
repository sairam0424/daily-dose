// PRECONDITION: this is an e2e-style test that only READS already-built
// output — it never invokes the build itself. It assumes `npm run build`
// (i.e. `astro build`) has already run before this suite executes, matching
// this project's real CI step order: install, then build, then test. If you
// are running this locally, run `npm run build` first.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { readAllPageCss } from "./testUtils.js";

const DIST_STATS = join(
  import.meta.dirname,
  "..",
  "dist",
  "stats",
  "index.html",
);
const STATS_JSONL = join(
  import.meta.dirname,
  "..",
  "src",
  "data",
  "stats.jsonl",
);

let html: string;

beforeAll(() => {
  if (!existsSync(DIST_STATS)) {
    throw new Error(
      "dist/stats/index.html not found. This test reads already-built output and " +
        "does not build the site itself — run `npm run build` first, then re-run the tests.",
    );
  }
  html = readFileSync(DIST_STATS, "utf-8");
});

describe("dist/stats/index.html build output", () => {
  it("is a real HTML document (contains the doctype declaration)", () => {
    expect(html.toUpperCase()).toContain("<!DOCTYPE HTML>");
  });

  it("reflects the real total cost computed from the committed stats.jsonl history", () => {
    const lines = readFileSync(STATS_JSONL, "utf-8")
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as { costUsd: number });

    expect(lines.length).toBeGreaterThan(0);

    const totalCostUsd = lines.reduce((sum, entry) => sum + entry.costUsd, 0);
    expect(html).toContain(`$${totalCostUsd.toFixed(4)}`);
  });

  it("never mentions per-story cost or raw per-call logs (explicitly out of scope)", () => {
    expect(html.toLowerCase()).not.toContain("per-story cost:");
  });

  it("(backlog fix) gives the model-ID cells the spec's medium font weight", () => {
    const style = readAllPageCss(html);
    expect(style).toMatch(
      /\.model-cell(\[[^\]]*\])?\s*\{[^}]*font-weight:\s*500/,
    );
  });

  it("renders the Page views section regardless of totalRuns (structural regression guard)", () => {
    // A post-redesign audit flagged this as verified-but-untested: the
    // "Page views" heading+paragraph must render even when totalRuns is
    // 0 (the {totalRuns === 0 ? (...) : (...)} ternary's OTHER branch),
    // but production has never had 0 real runs, so this can't be proven
    // by reading dist/stats/index.html alone. Guard the actual invariant
    // directly against the source: the Page-views block's raw text must
    // appear strictly AFTER the ternary's closing `)}`, which is what
    // makes it unconditional in the first place. If a future edit moves
    // it back inside either branch, this position check breaks.
    const source = readFileSync(
      join(import.meta.dirname, "..", "src", "pages", "stats.astro"),
      "utf-8",
    );
    const ternaryClose = source.indexOf("totalRuns === 0");
    expect(
      ternaryClose,
      "expected the totalRuns===0 ternary to exist",
    ).toBeGreaterThan(-1);

    const ternaryCloseEnd = source.indexOf(")}\n", ternaryClose);
    const pageViewsHeading = source.indexOf("Page views");
    expect(
      ternaryCloseEnd,
      "expected to find the ternary's closing )}",
    ).toBeGreaterThan(-1);
    expect(pageViewsHeading, "expected a Page views heading").toBeGreaterThan(
      -1,
    );
    expect(
      pageViewsHeading,
      "expected the Page views heading to appear after the totalRuns===0 ternary closes, not inside either of its branches",
    ).toBeGreaterThan(ternaryCloseEnd);
  });
});
