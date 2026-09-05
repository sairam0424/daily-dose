// PRECONDITION: e2e-style test reading already-built output — run `npm run
// build` first.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { DIST_DIR } from "./testUtils.js";

const DIST_SITEMAP_INDEX = join(DIST_DIR, "sitemap-index.xml");

let xml: string;

beforeAll(() => {
  if (!existsSync(DIST_SITEMAP_INDEX)) {
    throw new Error(
      "dist/sitemap-index.xml not found — run `npm run build` first.",
    );
  }
  xml = readFileSync(DIST_SITEMAP_INDEX, "utf-8");
});

describe("dist/sitemap-index.xml", () => {
  it("is a real sitemap index referencing at least one sitemap file", () => {
    expect(xml).toContain("<sitemapindex");
    expect(xml).toContain("<loc>");
  });
});
