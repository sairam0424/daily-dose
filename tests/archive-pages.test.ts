// PRECONDITION: this is an e2e-style test that only READS already-built
// output — it never invokes the build itself. It assumes `npm run build`
// (i.e. `astro build`) has already run before this suite executes, matching
// this project's real CI step order: install, then build, then test. If you
// are running this locally, run `npm run build` first.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { DigestItemSchema } from "../src/lib/digestSchema.js";

const DIST_ARCHIVE_INDEX = join(
  import.meta.dirname,
  "..",
  "dist",
  "archive",
  "index.html",
);
const DIGEST_BASE = join(import.meta.dirname, "..", "src", "data", "digest");
const DIST_ARCHIVE_BASE = join(import.meta.dirname, "..", "dist", "archive");

function findJsonFiles(base: string): string[] {
  return readdirSync(base, { recursive: true })
    .filter((entry) => typeof entry === "string" && entry.endsWith(".json"))
    .map((entry) => join(base, entry as string));
}

function readCommittedDates(): string[] {
  return readdirSync(DIGEST_BASE, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function readCommittedTitlesForDate(date: string): string[] {
  const dateDir = join(DIGEST_BASE, date);
  if (!existsSync(dateDir)) {
    return [];
  }
  return findJsonFiles(dateDir).map((filePath) => {
    const raw = readFileSync(filePath, "utf-8");
    const item = DigestItemSchema.parse(JSON.parse(raw));
    return item.title;
  });
}

let archiveIndexHtml: string;

beforeAll(() => {
  if (!existsSync(DIST_ARCHIVE_INDEX)) {
    throw new Error(
      "dist/archive/index.html not found. This test reads already-built output and " +
        "does not build the site itself — run `npm run build` first, then re-run the tests.",
    );
  }
  archiveIndexHtml = readFileSync(DIST_ARCHIVE_INDEX, "utf-8");
});

describe("dist/archive/index.html build output", () => {
  it("is a real HTML document (contains the doctype declaration)", () => {
    expect(archiveIndexHtml.toUpperCase()).toContain("<!DOCTYPE HTML>");
  });

  it("contains at least one real committed digest date", () => {
    const committedDates = readCommittedDates();
    expect(committedDates.length).toBeGreaterThan(0);

    const matchedDate = committedDates.find((date) =>
      archiveIndexHtml.includes(date),
    );
    expect(
      matchedDate,
      `expected dist/archive/index.html to contain at least one of: ${JSON.stringify(committedDates)}`,
    ).toBeTruthy();
  });

  it("links to all 4 per-source RSS feeds", () => {
    expect(archiveIndexHtml).toContain('href="/rss/hn.xml"');
    expect(archiveIndexHtml).toContain('href="/rss/arxiv.xml"');
    expect(archiveIndexHtml).toContain('href="/rss/github.xml"');
    expect(archiveIndexHtml).toContain('href="/rss/devto.xml"');
  });
});

describe("dist/archive/<date>/index.html build output", () => {
  const committedDates = readCommittedDates();

  it("has at least one committed digest date to test against", () => {
    expect(committedDates.length).toBeGreaterThan(0);
  });

  if (committedDates.length > 0) {
    const [firstDate] = committedDates;

    it(`renders a static page for ${firstDate} containing a real story title from that date`, () => {
      const datePagePath = join(DIST_ARCHIVE_BASE, firstDate, "index.html");
      expect(
        existsSync(datePagePath),
        `expected ${datePagePath} to exist — run \`npm run build\` first if it doesn't`,
      ).toBe(true);

      const html = readFileSync(datePagePath, "utf-8");
      const committedTitles = readCommittedTitlesForDate(firstDate);
      expect(committedTitles.length).toBeGreaterThan(0);

      const matchedTitle = committedTitles.find((title) =>
        html.includes(title),
      );
      expect(
        matchedTitle,
        `expected ${datePagePath} to contain at least one of: ${JSON.stringify(committedTitles)}`,
      ).toBeTruthy();
    });
  }
});
