// PRECONDITION: this is an e2e-style test that only READS already-built
// output — it never invokes the build itself. It assumes `npm run build`
// (i.e. `astro build`) has already run before this suite executes, matching
// this project's real CI step order: install, then build, then test. If you
// are running this locally, run `npm run build` first.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { DigestItemSchema } from "../src/lib/digestSchema.js";
import { DIST_DIR } from "./testUtils.js";

const DIST_ARCHIVE_INDEX = join(DIST_DIR, "archive", "index.html");
const DIGEST_BASE = join(import.meta.dirname, "..", "src", "data", "digest");
const DIST_ARCHIVE_BASE = join(DIST_DIR, "archive");

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

  it("(backlog) no longer duplicates an in-content 'subscribe to one source' block now that the shared footer already links every feed", () => {
    expect(archiveIndexHtml).not.toContain("Subscribe to just one source");
    // Each per-source feed link should appear exactly once (in the footer),
    // not twice (once in-content, once in the footer).
    for (const feed of ["hn", "arxiv", "github", "devto"]) {
      const occurrences =
        archiveIndexHtml.split(`href="/rss/${feed}.xml"`).length - 1;
      expect(occurrences, `expected exactly one link to /rss/${feed}.xml`).toBe(
        1,
      );
    }
  });

  it("(backlog) keeps Methodology out of both the top nav and the footer", () => {
    const navMatch = archiveIndexHtml.match(
      /<nav[^>]*class="site-nav"[^>]*>([\s\S]*?)<\/nav>/,
    );
    expect(navMatch, "expected a .site-nav").toBeTruthy();
    expect(navMatch![1]).not.toContain('href="/methodology"');

    const footerMatch = archiveIndexHtml.match(
      /<footer[^>]*>([\s\S]*?)<\/footer>/,
    );
    expect(footerMatch, "expected a <footer>").toBeTruthy();
    expect(footerMatch![1]).not.toContain('href="/methodology"');
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

    it("(backlog) does not render the interest-score chart on an archive date page", () => {
      const dates = readCommittedDates();
      const datePagePath = join(
        DIST_ARCHIVE_BASE,
        dates[dates.length - 1],
        "index.html",
      );
      const dateHtml = readFileSync(datePagePath, "utf-8");
      expect(dateHtml).not.toContain('id="score-chart"');
      expect(dateHtml).not.toContain("Interest scores");
    });

    it("(backlog) keeps Methodology out of both the top nav and the footer on a date page", () => {
      const dates = readCommittedDates();
      const datePagePath = join(
        DIST_ARCHIVE_BASE,
        dates[dates.length - 1],
        "index.html",
      );
      const dateHtml = readFileSync(datePagePath, "utf-8");
      const navMatch = dateHtml.match(
        /<nav[^>]*class="site-nav"[^>]*>([\s\S]*?)<\/nav>/,
      );
      expect(navMatch, "expected a .site-nav").toBeTruthy();
      expect(navMatch![1]).not.toContain('href="/methodology"');

      const footerMatch = dateHtml.match(/<footer[^>]*>([\s\S]*?)<\/footer>/);
      expect(footerMatch, "expected a <footer>").toBeTruthy();
      expect(footerMatch![1]).not.toContain('href="/methodology"');
    });
  }
});
