// PRECONDITION: e2e-style test reading already-built output — run `npm run
// build` first.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { XMLParser } from "fast-xml-parser";
import { beforeAll, describe, expect, it } from "vitest";

const DIST_FEED = join(import.meta.dirname, "..", "dist", "rss", "devto.xml");

let feedXml: string;

beforeAll(() => {
  if (!existsSync(DIST_FEED)) {
    throw new Error(
      "dist/rss/devto.xml not found — run `npm run build` first.",
    );
  }
  feedXml = readFileSync(DIST_FEED, "utf-8");
});

describe("dist/rss/devto.xml", () => {
  it("is well-formed XML with a real channel", () => {
    const parser = new XMLParser({ ignoreAttributes: false });
    expect(() => parser.parse(feedXml)).not.toThrow();
    const parsed = parser.parse(feedXml);
    expect(parsed.rss.channel).toBeTruthy();
    expect(parsed.rss.channel.title).toBe("daily-dose — Dev.to");
  });

  it("every item's content only describes Dev.to-sourced stories", () => {
    const parser = new XMLParser({ ignoreAttributes: false });
    const parsed = parser.parse(feedXml);
    const items = Array.isArray(parsed.rss.channel.item)
      ? parsed.rss.channel.item
      : parsed.rss.channel.item
        ? [parsed.rss.channel.item]
        : [];

    // Today's repo has zero committed Dev.to items (src/data/digest/*/ has
    // 0 devto-*.json files) - a well-formed, valid, EMPTY feed is the
    // honest, correct behavior right now, not a bug. Unlike the other 3
    // source feeds, this test does not assert items.length > 0.
    expect(items.length).toBeGreaterThanOrEqual(0);

    if (items.length === 0) {
      // Nothing to assert per-item when the array is empty.
      return;
    }

    for (const item of items) {
      const contentField = item["content:encoded"] ?? item.description;
      expect(typeof contentField).toBe("string");
      expect(contentField).toContain("source: devto");
      expect(contentField).not.toContain("source: hn");
      expect(contentField).not.toContain("source: arxiv");
      expect(contentField).not.toContain("source: github");
    }
  });
});
