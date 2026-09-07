// PRECONDITION: this is an e2e-style test that only READS already-built
// output — it never invokes the build itself. Assumes `npm run build` has
// already run before this suite executes. If running locally, build first.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { DIST_DIR } from "./testUtils.js";

const DIST_ROBOTS = join(DIST_DIR, "robots.txt");

let robotsTxt: string;

beforeAll(() => {
  if (!existsSync(DIST_ROBOTS)) {
    throw new Error(
      "dist/client/robots.txt not found. This test reads already-built output and " +
        "does not build the site itself — run `npm run build` first, then re-run the tests.",
    );
  }
  robotsTxt = readFileSync(DIST_ROBOTS, "utf-8");
});

describe("dist/client/robots.txt build output", () => {
  it("allows crawling by default", () => {
    expect(robotsTxt).toMatch(/User-agent:\s*\*/);
    expect(robotsTxt).toMatch(/Allow:\s*\//);
  });

  it("disallows /methodology, matching its existing sitemap/nav/footer exclusion", () => {
    expect(robotsTxt).toMatch(/Disallow:\s*\/methodology/);
  });

  it("does NOT disallow /stats (already protected by real Basic Auth, not by hiding it)", () => {
    expect(robotsTxt).not.toMatch(/Disallow:\s*\/stats/);
  });

  it("points to the real sitemap-index.xml with the correct absolute domain", () => {
    expect(robotsTxt).toMatch(
      /Sitemap:\s*https:\/\/daily-dose-hazel-delta\.vercel\.app\/sitemap-index\.xml/,
    );
  });
});
