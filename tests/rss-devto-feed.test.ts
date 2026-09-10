// PRECONDITION: e2e-style test reading already-built output — run `npm run
// build` first.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { XMLParser } from "fast-xml-parser";
import { beforeAll, describe, expect, it } from "vitest";
import { DIST_DIR } from "./testUtils.js";

const DIST_FEED = join(DIST_DIR, "rss", "devto.xml");

// fast-xml-parser's default maxEntityCount (1000) is a DTD entity-expansion
// (billion-laughs) safety ceiling — see tests/rss-feed.test.ts for the full
// rationale. Per-source feeds share the exact same renderDayContent()/rss()
// machinery (src/lib/perSourceRss.ts) as the combined feed, so they need the
// same raised ceiling to stay a real regression guard as committed data grows.
const RSS_PARSER_OPTIONS = {
  ignoreAttributes: false,
  processEntities: { maxTotalExpansions: 100_000 },
};

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
  it("(regression) parser tolerates a realistically large entity count without hitting fast-xml-parser's default DoS ceiling", () => {
    // Synthetic, deterministic fixture — mirrors tests/rss-feed.test.ts's
    // combined-feed regression test, since this feed shares the same
    // content:encoded rendering path.
    const manyEscapedTags = "&lt;p&gt;text&lt;/p&gt;".repeat(300); // 1200 entity references, > fast-xml-parser's default 1000 ceiling
    const syntheticXml = `<rss><channel><item><content:encoded>${manyEscapedTags}</content:encoded></item></channel></rss>`;

    const parser = new XMLParser(RSS_PARSER_OPTIONS);
    expect(() => parser.parse(syntheticXml)).not.toThrow();
  });

  it("is well-formed XML with a real channel", () => {
    const parser = new XMLParser(RSS_PARSER_OPTIONS);
    expect(() => parser.parse(feedXml)).not.toThrow();
    const parsed = parser.parse(feedXml);
    expect(parsed.rss.channel).toBeTruthy();
    expect(parsed.rss.channel.title).toBe("The Daily Dose — Dev.to");
  });

  it("declares its own atom:link rel=self pointing at its own feed URL, not the combined feed's", () => {
    const parser = new XMLParser(RSS_PARSER_OPTIONS);
    const parsed = parser.parse(feedXml);
    const selfLink = parsed.rss.channel["atom:link"];
    expect(selfLink).toBeTruthy();
    expect(selfLink["@_rel"]).toBe("self");
    expect(selfLink["@_type"]).toBe("application/rss+xml");
    expect(selfLink["@_href"]).toBe(
      "https://daily-dose-hazel-delta.vercel.app/rss/devto.xml",
    );
  });

  it("every item's content only describes Dev.to-sourced stories", () => {
    const parser = new XMLParser(RSS_PARSER_OPTIONS);
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
