// PRECONDITION: this is an e2e-style test that only READS already-built
// output — it never invokes the build itself. It assumes `npm run build`
// (i.e. `astro build`) has already run before this suite executes, matching
// this project's real CI step order: install, then build, then test. If you
// are running this locally, run `npm run build` first.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { XMLParser } from "fast-xml-parser";
import rssBuilder from "@astrojs/rss";
import { beforeAll, describe, expect, it } from "vitest";
import { renderDayContent } from "../src/lib/rssContent.js";
import type { DigestItem } from "../src/lib/digestSchema.js";
import { DIST_DIR } from "./testUtils.js";

const DIST_RSS = join(DIST_DIR, "rss.xml");
const DIGEST_BASE = join(import.meta.dirname, "..", "src", "data", "digest");

// fast-xml-parser's default maxEntityCount (1000) is a DTD entity-expansion
// (billion-laughs) safety ceiling - it also counts every predefined entity
// reference (&amp;, &lt;, etc.) toward that same total, not just malicious
// DTD-declared entities. rss.xml has no windowing (every committed digest
// date is included forever, see src/pages/rss.xml.ts), so this count only
// grows as real data accumulates - confirmed: the 2026-09-05 real Bedrock
// pipeline run alone pushed the live feed's count to 1016, past the
// default. This is a parser safety default that needs to scale with real
// content growth, not an actual XML validity bug in the feed itself (it is
// never given untrusted external XML - only this project's own build
// output). Revisit if growth ever approaches this ceiling again.
const RSS_PARSER_OPTIONS = {
  ignoreAttributes: false,
  processEntities: { maxTotalExpansions: 100_000 },
};

function readCommittedDates(): string[] {
  return readdirSync(DIGEST_BASE, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

let rssXml: string;

beforeAll(() => {
  if (!existsSync(DIST_RSS)) {
    throw new Error(
      "dist/rss.xml not found. This test reads already-built output and " +
        "does not build the site itself — run `npm run build` first, then re-run the tests.",
    );
  }
  rssXml = readFileSync(DIST_RSS, "utf-8");
});

describe("dist/rss.xml build output", () => {
  it("(regression) parser tolerates a realistically large entity count without hitting fast-xml-parser's default DoS ceiling", () => {
    // Synthetic, deterministic fixture - independent of how many real
    // entities today's committed data happens to contain, so this stays a
    // real regression guard regardless of tomorrow's real corpus size.
    // &lt;/&gt; (not &amp;) is the real trigger: content:encoded's escaped
    // HTML markup (every <p>, <a href>, etc. from real item titles/why_read
    // rendered as HTML) is what actually accumulates past the ceiling -
    // confirmed against the real 2026-09-05 pipeline run's dist/rss.xml,
    // which had 1017 total &lt;/&gt; references and only 1 literal &amp;.
    const manyEscapedTags = "&lt;p&gt;text&lt;/p&gt;".repeat(300); // 1200 entity references, > fast-xml-parser's default 1000 ceiling
    const syntheticXml = `<rss><channel><item><content:encoded>${manyEscapedTags}</content:encoded></item></channel></rss>`;

    const parser = new XMLParser(RSS_PARSER_OPTIONS);
    expect(() => parser.parse(syntheticXml)).not.toThrow();
  });

  it("is well-formed enough to parse as XML", () => {
    const parser = new XMLParser(RSS_PARSER_OPTIONS);
    expect(() => parser.parse(rssXml)).not.toThrow();

    const parsed = parser.parse(rssXml);
    expect(parsed.rss).toBeTruthy();
    expect(parsed.rss.channel).toBeTruthy();
  });

  it("contains at least one real <item> whose title/link corresponds to a real committed digest date", () => {
    const committedDates = readCommittedDates();
    expect(committedDates.length).toBeGreaterThan(0);

    const parser = new XMLParser(RSS_PARSER_OPTIONS);
    const parsed = parser.parse(rssXml);
    const items = Array.isArray(parsed.rss.channel.item)
      ? parsed.rss.channel.item
      : [parsed.rss.channel.item];

    expect(items.length).toBeGreaterThan(0);

    const matchedDate = committedDates.find((date) =>
      items.some(
        (item: { title?: string; link?: string }) =>
          typeof item.title === "string" &&
          item.title.includes(date) &&
          typeof item.link === "string" &&
          item.link.includes(`/archive/${date}/`),
      ),
    );

    expect(
      matchedDate,
      `expected dist/rss.xml to contain an <item> for one of: ${JSON.stringify(committedDates)}`,
    ).toBeTruthy();
  });
});

describe("renderDayContent escaping (regression)", () => {
  // A real, latent bug found during review: @astrojs/rss's rss() already
  // entity-escapes the entire composed content string exactly once when
  // serializing <content:encoded>. If renderDayContent ALSO pre-escaped
  // field values, a title/why_read containing a literal &, <, or > would
  // come out double-escaped ("&amp;amp;" instead of "&amp;") - invisible
  // with the tiny current dataset (no such characters in it yet), but a
  // real bug the moment one appears. This test proves the fix end-to-end
  // through the real rss() call, not just by inspecting the raw string.
  it("never double-escapes a title containing a literal ampersand", async () => {
    const fakeItem: DigestItem = {
      title: "React & Redux: a comparison",
      source: "hn",
      url: "https://example.com",
      date: "2026-09-04",
      tags: [],
      interest_score: 5,
      why_read: "Covers <state management> in depth & is well-argued.",
      authors: [],
    };

    const content = renderDayContent([fakeItem]);

    // renderDayContent's own output must be RAW (unescaped) - proves this
    // layer does not pre-escape.
    expect(content).toContain("React & Redux");

    const feed = await rssBuilder({
      title: "test",
      description: "test",
      site: "https://example.com",
      items: [
        {
          title: "daily-dose — 2026-09-04",
          pubDate: new Date("2026-09-04"),
          link: "/archive/2026-09-04/",
          content,
        },
      ],
    });
    const xml = await feed.text();

    // Exactly one level of escaping in the final XML - "&amp;", never the
    // double-escaped "&amp;amp;" the bug would have produced.
    expect(xml).toContain("React &amp; Redux");
    expect(xml).not.toContain("&amp;amp;");
  });

  // (backlog fix) A real gap found during a post-redesign audit: every
  // <item>'s own <link>/<guid> only ever pointed at the daily archive
  // page, and content:encoded never linked out to the item's real
  // source (the HN thread, the arXiv paper, the GitHub repo, the Dev.to
  // post) even though DigestItem always carries a real, validated url.
  // RSS readers had no way to deep-link from the feed itself.
  it("links each story's title to its real source url, not just the archive page", () => {
    const fakeItem: DigestItem = {
      title: "A real story title",
      source: "github",
      url: "https://github.com/example/real-repo",
      date: "2026-09-04",
      tags: [],
      interest_score: 5,
      why_read: "A real reason.",
      authors: [],
    };

    const content = renderDayContent([fakeItem]);

    expect(content).toContain(
      '<a href="https://github.com/example/real-repo">A real story title</a>',
    );
  });
});
