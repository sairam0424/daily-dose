// PRECONDITION: this is an e2e-style test that only READS already-built
// output — it never invokes the build itself. Run `npm run build` first.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { DIST_DIR } from "./testUtils.js";

const SITE = "https://daily-dose-hazel-delta.vercel.app";
const DIGEST_BASE = join(import.meta.dirname, "..", "src", "data", "digest");

function readLatestCommittedDate(): string | null {
  const dates = readdirSync(DIGEST_BASE, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  return dates.at(-1) ?? null;
}

function canonicalHref(html: string): string | null {
  const match = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"\s*\/?>/i);
  return match?.[1] ?? null;
}

describe("canonical tags", () => {
  const latestDate = readLatestCommittedDate();

  const cases: Array<[string, string, string]> = [
    ["homepage", join(DIST_DIR, "index.html"), `${SITE}/`],
    [
      "methodology",
      join(DIST_DIR, "methodology", "index.html"),
      `${SITE}/methodology`,
    ],
    ["privacy", join(DIST_DIR, "privacy", "index.html"), `${SITE}/privacy`],
    [
      "archive index",
      join(DIST_DIR, "archive", "index.html"),
      `${SITE}/archive/`,
    ],
    ["404", join(DIST_DIR, "404.html"), `${SITE}/404`],
  ];

  if (latestDate) {
    cases.push([
      `archive date (${latestDate})`,
      join(DIST_DIR, "archive", latestDate, "index.html"),
      `${SITE}/archive/${latestDate}/`,
    ]);
  }

  for (const [label, distPath, expectedUrl] of cases) {
    it(`(regression) ${label} declares itself as its own canonical URL`, () => {
      if (!existsSync(distPath)) {
        throw new Error(`${distPath} not found — run \`npm run build\` first.`);
      }
      const html = readFileSync(distPath, "utf-8");
      expect(
        canonicalHref(html),
        `expected a <link rel="canonical"> on ${label}`,
      ).toBe(expectedUrl);
    });
  }
});
