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
});
