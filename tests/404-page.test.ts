// PRECONDITION: e2e-style test reading already-built output — run `npm run
// build` first.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { DIST_DIR } from "./testUtils.js";

const DIST_404 = join(DIST_DIR, "404.html");

let html: string;

beforeAll(() => {
  if (!existsSync(DIST_404)) {
    throw new Error("dist/404.html not found — run `npm run build` first.");
  }
  html = readFileSync(DIST_404, "utf-8");
});

describe("dist/404.html", () => {
  it("is a real HTML document", () => {
    expect(html.toUpperCase()).toContain("<!DOCTYPE HTML>");
  });

  it("uses plain, honest copy - no apology, no bare '404' headline, no blaming the reader for a typo", () => {
    // Confirmed via deep research (FT's own live A/B test): plain "Page
    // not found" copy without apology/blame outperforms other framings.
    // Scoped to the visible <main>/<h1> content, not the whole document -
    // the technical /404 path itself legitimately appears in meta tags
    // (canonical URL, og:url) and isn't part of the reader-facing copy.
    const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/);
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    expect(mainMatch, "expected a <main>").toBeTruthy();
    expect(h1Match, "expected an <h1>").toBeTruthy();
    const visibleCopy = h1Match![1] + mainMatch![1];
    expect(html).toContain("Page not found");
    expect(visibleCopy).not.toMatch(/\bsorry\b/i);
    expect(visibleCopy).not.toMatch(/\b404\b/);
    expect(visibleCopy).not.toMatch(/mistyp|misspell/i);
  });

  it("offers exactly 3 onward-navigation links, matching real editorial-404 precedent", () => {
    const linksMatch = html.match(
      /<ul class="not-found-links"[^>]*>([\s\S]*?)<\/ul>/,
    );
    expect(linksMatch, "expected the not-found-links list").toBeTruthy();
    const hrefs = [...linksMatch![1].matchAll(/href="([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(hrefs).toEqual(["/", "/archive/", "/rss.xml"]);
  });

  it("uses the shared Layout - real masthead and footer, not a bare disconnected error page", () => {
    expect(html).toContain('class="masthead"');
    expect(html).toContain("<footer");
  });
});
