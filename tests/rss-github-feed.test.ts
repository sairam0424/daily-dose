// PRECONDITION: e2e-style test reading already-built output — run `npm run
// build` first.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { XMLParser } from "fast-xml-parser";
import { beforeAll, describe, expect, it } from "vitest";
import { DIST_DIR } from "./testUtils.js";

const DIST_FEED = join(DIST_DIR, "rss", "github.xml");

let feedXml: string;

beforeAll(() => {
  if (!existsSync(DIST_FEED)) {
    throw new Error(
      "dist/rss/github.xml not found — run `npm run build` first.",
    );
  }
  feedXml = readFileSync(DIST_FEED, "utf-8");
});

describe("dist/rss/github.xml", () => {
  it("is well-formed XML with a real channel", () => {
    const parser = new XMLParser({ ignoreAttributes: false });
    expect(() => parser.parse(feedXml)).not.toThrow();
    const parsed = parser.parse(feedXml);
    expect(parsed.rss.channel).toBeTruthy();
    expect(parsed.rss.channel.title).toBe("The Daily Dose — GitHub");
  });

  it("every item's content only describes GitHub-sourced stories", () => {
    const parser = new XMLParser({ ignoreAttributes: false });
    const parsed = parser.parse(feedXml);
    const items = Array.isArray(parsed.rss.channel.item)
      ? parsed.rss.channel.item
      : parsed.rss.channel.item
        ? [parsed.rss.channel.item]
        : [];

    // Real committed data today has 5 github-*.json items under one date -
    // confirms this feed isn't empty due to a filtering bug.
    expect(items.length).toBeGreaterThan(0);

    for (const item of items) {
      const contentField = item["content:encoded"] ?? item.description;
      expect(typeof contentField).toBe("string");
      expect(contentField).toContain("source: github");
      expect(contentField).not.toContain("source: hn");
      expect(contentField).not.toContain("source: arxiv");
      expect(contentField).not.toContain("source: devto");
    }
  });
});
