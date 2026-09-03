// PRECONDITION: this is an e2e-style test that only READS already-built
// output — it never invokes the build itself. It assumes `npm run build`
// (i.e. `astro build`) has already run before this suite executes, matching
// this project's real CI step order: install, then build, then test. If you
// are running this locally, run `npm run build` first.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { DigestItemSchema } from "../src/lib/digestSchema.js";

const DIST_INDEX = join(import.meta.dirname, "..", "dist", "index.html");
const DIGEST_BASE = join(import.meta.dirname, "..", "src", "data", "digest");

function findJsonFiles(base: string): string[] {
  return readdirSync(base, { recursive: true })
    .filter((entry) => typeof entry === "string" && entry.endsWith(".json"))
    .map((entry) => join(base, entry as string));
}

function readCommittedTitles(): string[] {
  return findJsonFiles(DIGEST_BASE).map((filePath) => {
    const raw = readFileSync(filePath, "utf-8");
    const item = DigestItemSchema.parse(JSON.parse(raw));
    return item.title;
  });
}

let html: string;

beforeAll(() => {
  if (!existsSync(DIST_INDEX)) {
    throw new Error(
      "dist/index.html not found. This test reads already-built output and " +
        "does not build the site itself — run `npm run build` first, then re-run the tests.",
    );
  }
  html = readFileSync(DIST_INDEX, "utf-8");
});

describe("dist/index.html build output", () => {
  it("is a real HTML document (contains the doctype declaration)", () => {
    expect(html.toUpperCase()).toContain("<!DOCTYPE HTML>");
  });

  it("contains at least one real story title from the committed digest content", () => {
    const committedTitles = readCommittedTitles();
    expect(committedTitles.length).toBeGreaterThan(0);

    const matchedTitle = committedTitles.find((title) => html.includes(title));
    expect(
      matchedTitle,
      `expected dist/index.html to contain at least one of: ${JSON.stringify(committedTitles)}`,
    ).toBeTruthy();
  });

  it("shows evidence the Chart.js island is present in the output", () => {
    const hasChartCanvas = html.includes('id="score-chart"');
    const hasChartJsReference =
      html.includes("chart.js") || html.includes("new Chart(");
    expect(hasChartCanvas).toBe(true);
    expect(hasChartJsReference).toBe(true);
  });

  it("has a real favicon <link> tag", () => {
    const iconLinkMatch = html.match(/<link\s+[^>]*rel="icon"[^>]*>/i);
    expect(
      iconLinkMatch,
      'expected dist/index.html to contain a <link rel="icon"> tag',
    ).toBeTruthy();
    expect(iconLinkMatch?.[0]).toContain("/favicon.svg");
  });

  it("has an og:image meta tag with an absolute URL that resolves to a real committed file", () => {
    const ogImageMatch = html.match(
      /<meta\s+[^>]*property="og:image"[^>]*content="([^"]+)"[^>]*>/i,
    );
    expect(
      ogImageMatch,
      'expected dist/index.html to contain a <meta property="og:image"> tag',
    ).toBeTruthy();

    const ogImageUrl = ogImageMatch?.[1] ?? "";
    // Must be absolute (og:image is read by remote crawlers with no page
    // context to resolve a relative URL against).
    expect(() => new URL(ogImageUrl)).not.toThrow();

    const imagePath = new URL(ogImageUrl).pathname;
    const distImagePath = join(import.meta.dirname, "..", "dist", imagePath);
    expect(
      existsSync(distImagePath),
      `expected og:image URL ${ogImageUrl} to resolve to a real file at ${distImagePath}`,
    ).toBe(true);
  });

  it("renders a real HN discussion link for HN-sourced stories", () => {
    const hnFile = findJsonFiles(DIGEST_BASE).find((filePath) =>
      filePath.includes("hn-"),
    );
    expect(
      hnFile,
      "expected at least one committed hn-*.json digest file",
    ).toBeTruthy();

    const item = DigestItemSchema.parse(
      JSON.parse(readFileSync(hnFile as string, "utf-8")),
    );
    expect(
      item.hn_id,
      "expected the committed HN story to have a real hn_id",
    ).toBeTypeOf("number");

    const expectedHref = `https://news.ycombinator.com/item?id=${item.hn_id}`;
    expect(
      html.includes(expectedHref),
      `expected dist/index.html to contain a Discuss link to ${expectedHref}`,
    ).toBe(true);
  });

  it("has a real theme toggle button with a persistence script", () => {
    expect(html.includes('id="theme-toggle"')).toBe(true);
    expect(html.includes("localStorage")).toBe(true);
  });
});
