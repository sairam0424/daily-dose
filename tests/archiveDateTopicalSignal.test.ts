// PRECONDITION: e2e-style test reading already-built output — run `npm run
// build` first.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { DIST_DIR } from "./testUtils.js";

const ARCHIVE_DIR = join(DIST_DIR, "archive");

let firstDateDir: string;
let html: string;

beforeAll(() => {
  if (!existsSync(ARCHIVE_DIR)) {
    throw new Error("dist/archive not found — run `npm run build` first.");
  }
  const dateDirs = readdirSync(ARCHIVE_DIR, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name),
  );
  if (dateDirs.length === 0) {
    throw new Error("No dated archive pages found in dist/archive.");
  }
  firstDateDir = dateDirs[0].name;
  html = readFileSync(join(ARCHIVE_DIR, firstDateDir, "index.html"), "utf-8");
});

describe("dated archive page topical signal", () => {
  it("(seo fix) no longer repeats the fully generic tagline with zero topical content", () => {
    expect(html).not.toContain(
      "The technical news worth your next fifteen minutes.</p>",
    );
  });

  it("(seo fix) mentions the real lead story's own title, not just the bare date", () => {
    // The lead story's title is real, per-date data - this just confirms
    // the page renders SOME non-date-only topical text in the masthead
    // tagline, without hardcoding which title (that varies per date).
    // Astro injects a data-astro-cid-* attribute onto elements in a
    // component that has a <style> block, so the tag can't be matched as a
    // bare `<p class="tagline">` - allow any additional attributes.
    const taglineMatch = html.match(/<p class="tagline"[^>]*>([\s\S]*?)<\/p>/);
    expect(taglineMatch, "expected a tagline paragraph").toBeTruthy();
    expect(taglineMatch![1].length).toBeGreaterThan(
      "The technical news worth your next fifteen minutes.".length,
    );
  });

  it("(regression) bounds the meta description length so a real, unbounded lead-story title can never blow past the SERP snippet ceiling", () => {
    const descMatch = html.match(/<meta name="description" content="([^"]*)"/);
    expect(descMatch, "expected a meta description tag").toBeTruthy();
    // Astro HTML-escapes the quotes this template wraps the lead title in
    // (" -> &#34;/&quot;) - decode before measuring the real reader-facing
    // character count, not the escaped byte count.
    const decoded = descMatch![1]
      .replace(/&#34;|&quot;/g, '"')
      .replace(/&amp;/g, "&");
    expect(decoded.length).toBeLessThanOrEqual(160);
  });

  it("(regression) never produces double terminal punctuation when the lead title already ends in ?/!/.", () => {
    // Scoped to the tagline paragraph's own text, not the whole page - a
    // page-wide regex would false-positive on unrelated punctuation
    // elsewhere (e.g. inside an aria-label or analysis paragraph).
    const taglineMatch = html.match(/<p class="tagline"[^>]*>([\s\S]*?)<\/p>/);
    expect(taglineMatch, "expected a tagline paragraph").toBeTruthy();
    expect(taglineMatch![1]).not.toMatch(/[.?!]{2,}["…]/);
  });

  it("(regression) has a real h2 before the story list, so the heading outline is h1 -> h2 -> h3 with no skip", () => {
    const headings = html.match(/<h[1-4][^>]*>/g) ?? [];
    const levels = headings.map((h) => Number(h.match(/<h([1-4])/)![1]));
    expect(levels[0]).toBe(1);
    expect(levels).toContain(2);
    // No level ever jumps by more than 1 from the previous heading.
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
    }
  });
});
