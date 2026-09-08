// PRECONDITION: e2e-style test reading already-built output — run `npm run
// build` first.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { DIST_DIR } from "./testUtils.js";

const DIST_SITEMAP_INDEX = join(DIST_DIR, "sitemap-index.xml");
const DIST_SITEMAP_0 = join(DIST_DIR, "sitemap-0.xml");

let xml: string;
let urlListXml: string;

beforeAll(() => {
  if (!existsSync(DIST_SITEMAP_INDEX)) {
    throw new Error(
      "dist/sitemap-index.xml not found — run `npm run build` first.",
    );
  }
  xml = readFileSync(DIST_SITEMAP_INDEX, "utf-8");

  if (!existsSync(DIST_SITEMAP_0)) {
    throw new Error(
      "dist/sitemap-0.xml not found — run `npm run build` first.",
    );
  }
  urlListXml = readFileSync(DIST_SITEMAP_0, "utf-8");
});

describe("dist/sitemap-index.xml", () => {
  it("is a real sitemap index referencing at least one sitemap file", () => {
    expect(xml).toContain("<sitemapindex");
    expect(xml).toContain("<loc>");
  });

  it("(regression) excludes /methodology - it's deliberately delisted from every nav/footer, so search engines shouldn't surface it as an entry point either", () => {
    expect(urlListXml).not.toContain("/methodology");
    // Confirm the filter isn't accidentally over-broad - real pages must
    // still be listed.
    expect(urlListXml).toContain(
      "<loc>https://daily-dose-hazel-delta.vercel.app/</loc>",
    );
    expect(urlListXml).toContain("/archive/");
  });

  it("(regression) excludes /stats - it's real HTTP Basic Auth-gated (401), so publishing it would waste crawl budget on a URL crawlers can never read", () => {
    expect(urlListXml).not.toContain("/stats");
  });

  it("(regression) gives every /archive/{date}/ URL a real <lastmod> matching its own URL date, not a blanket build timestamp", () => {
    const dateUrlMatches = [
      ...urlListXml.matchAll(
        /<url><loc>https:\/\/daily-dose-hazel-delta\.vercel\.app\/archive\/(\d{4}-\d{2}-\d{2})\/<\/loc><lastmod>([^<]+)<\/lastmod><\/url>/g,
      ),
    ];
    expect(
      dateUrlMatches.length,
      "expected at least one dated archive URL",
    ).toBeGreaterThan(0);
    for (const [, urlDate, lastmod] of dateUrlMatches) {
      expect(lastmod.startsWith(urlDate)).toBe(true);
    }
  });
});
