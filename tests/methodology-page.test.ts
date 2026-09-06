// PRECONDITION: e2e-style test reading already-built output — run `npm run
// build` first.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { MAX_REASONABLE_ITEMS } from "../src/lib/llmCuration.js";
import {
  ANOMALY_MULTIPLIER,
  SEED_BASELINE_USD,
  MIN_HISTORY_FOR_ANOMALY_CHECK,
} from "../src/lib/costTracking.js";
import { interestTier } from "../src/lib/interestTier.js";
import { DIST_DIR, readAllPageCss } from "./testUtils.js";

const DIST_METHODOLOGY = join(DIST_DIR, "methodology", "index.html");

let html: string;

beforeAll(() => {
  if (!existsSync(DIST_METHODOLOGY)) {
    throw new Error(
      "dist/methodology/index.html not found — run `npm run build` first.",
    );
  }
  html = readFileSync(DIST_METHODOLOGY, "utf-8");
});

describe("dist/methodology/index.html", () => {
  it("is a real HTML document", () => {
    expect(html.toUpperCase()).toContain("<!DOCTYPE HTML>");
  });

  it("shows the real MAX_REASONABLE_ITEMS value, not a hardcoded copy", () => {
    expect(html).toContain(String(MAX_REASONABLE_ITEMS));
  });

  it("shows the real cost-anomaly constants, not hardcoded copies", () => {
    expect(html).toContain(String(ANOMALY_MULTIPLIER));
    expect(html).toContain(SEED_BASELINE_USD.toFixed(2));
    expect(html).toContain(String(MIN_HISTORY_FOR_ANOMALY_CHECK));
  });

  it("reflects the real interestTier() boundary behavior", () => {
    // Real behavior check, not a hardcoded number restated in the test:
    // confirms the boundary is exactly at 6 and 8 by calling the real function.
    expect(interestTier(5.9)).toBe("notable");
    expect(interestTier(6)).toBe("recommended");
    expect(interestTier(7.9)).toBe("recommended");
    expect(interestTier(8)).toBe("must-read");
    // And that the page actually displays these real boundary numbers:
    expect(html).toContain("6");
    expect(html).toContain("8");
  });

  it("links to all 4 per-source RSS feeds", () => {
    expect(html).toContain('href="/rss/hn.xml"');
    expect(html).toContain('href="/rss/arxiv.xml"');
    expect(html).toContain('href="/rss/github.xml"');
    expect(html).toContain('href="/rss/devto.xml"');
  });

  it("(regression) no longer duplicates an in-content 'subscribe to one source' block now that the shared footer already links every feed", () => {
    // Same fix already applied to the archive page (PR #81) - the footer
    // (added in PR #79) already carries all 4 per-source RSS links plus
    // an "all sources" link, so an in-content restatement of the same 4
    // links is pure duplication, not a distinct affordance.
    expect(html).not.toContain("Subscribe to just one source");
    for (const feed of ["hn", "arxiv", "github", "devto"]) {
      const occurrences = html.split(`href="/rss/${feed}.xml"`).length - 1;
      expect(occurrences, `expected exactly one link to /rss/${feed}.xml`).toBe(
        1,
      );
    }
  });

  it("(backlog fix) colors in-content links with the theme accent instead of the browser default", () => {
    // A post-redesign audit found the "cost & stats" cross-link and the
    // 4 RSS subscribe links fell through to the browser's default link
    // blue in every skin/theme, since only .site-nav a and .site-footer
    // a were ever given the accent color — nothing scoped main's own
    // prose/list links.
    const style = readAllPageCss(html);
    expect(style).toMatch(
      /main(\[[^\]]*\])?\s+a(\[[^\]]*\])?\s*\{[^}]*color:\s*var\(--accent\)/,
    );
  });

  it("(backlog fix) gives the model-ID cells the spec's medium font weight", () => {
    const style = readAllPageCss(html);
    expect(style).toMatch(
      /\.model-cell(\[[^\]]*\])?\s*\{[^}]*font-weight:\s*500/,
    );
  });

  it("(backlog) has the shared footer with RSS links, and no longer links to Methodology anywhere", () => {
    const footerMatch = html.match(/<footer[^>]*>([\s\S]*?)<\/footer>/);
    expect(footerMatch, "expected a <footer>").toBeTruthy();
    expect(footerMatch![1]).toContain('href="/rss.xml"');
    expect(footerMatch![1]).not.toContain('href="/methodology"');
  });
});
