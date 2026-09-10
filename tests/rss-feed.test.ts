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
  // A real gap found by a research sweep (see docs/superpowers/plans/
  // 2026-09-10-research-sweep-fixes.md item 1d): renderStoryListItem's
  // hand-written structural tags (<li>/<strong>/<a href>/<p>) are
  // deliberately left RAW here so they survive @astrojs/rss's own single
  // escape pass, plus a real RSS reader's single XML-unescape, and come
  // back out as real HTML. But the untrusted field values (title/
  // why_read/source) must NOT become live markup after that same single
  // reader-side unescape - fixed by escaping them once HERE, before
  // rss()'s own escape pass ever sees them. Net effect: untrusted values
  // go through TWO escapes (this file's, then rss()'s) against the
  // reader's ONE real unescape, so they still read back as inert escaped
  // text - never a live <script> tag or a raw ampersand a downstream
  // parser could misinterpret as an entity start - even after that
  // unescape.
  it("escapes an untrusted title/why_read/source exactly once at this layer, leaving the structural tags raw", () => {
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

    // Field values are escaped exactly once at this layer - a single "&"
    // becomes a single "&amp;", not left raw and not double-escaped to
    // "&amp;amp;" at THIS layer (rss()'s own pass, tested separately
    // below, is a different layer and intentionally adds a second one).
    expect(content).toContain("React &amp; Redux");
    expect(content).not.toContain("React & Redux");
    expect(content).toContain(
      "Covers &lt;state management&gt; in depth &amp; is well-argued.",
    );
    // The hand-written structural tags stay raw at this layer.
    expect(content).toContain("<li>");
    expect(content).toContain("<strong>");
  });

  it("(security fix) escapes a title containing a literal <script> tag to inert text, not live markup, at this layer", () => {
    const fakeItem: DigestItem = {
      title: "<script>alert(1)</script>",
      source: "hn",
      url: "https://example.com",
      date: "2026-09-04",
      tags: [],
      interest_score: 5,
      why_read: "A real reason.",
      authors: [],
    };

    const content = renderDayContent([fakeItem]);

    expect(content).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(content).not.toContain("<script>alert(1)</script>");
  });

  it("(security fix) keeps an untrusted <script> payload inert end-to-end through the real rss() call, even after simulating a real reader's single XML-unescape", async () => {
    const fakeItem: DigestItem = {
      title: "React & Redux <script>alert(1)</script>",
      source: "hn",
      url: "https://example.com",
      date: "2026-09-04",
      tags: [],
      interest_score: 5,
      why_read: "A real reason.",
      authors: [],
    };

    const content = renderDayContent([fakeItem]);

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

    // rss()'s own single escape pass runs on top of this file's escape,
    // so the untrusted title now shows up double-escaped in the raw built
    // XML - a real, visible, and INTENTIONAL trade-off (this security fix
    // deliberately overturns the old "never double-escape" assumption for
    // untrusted field values specifically, while leaving structural tags
    // single-escaped as before).
    expect(xml).toContain("&amp;amp;");
    expect(xml).toContain("&amp;lt;script&amp;gt;");
    expect(xml).not.toContain("<script>alert(1)</script>");

    // Simulate exactly what a spec-compliant RSS reader does: XML-unescape
    // the <content:encoded> text node's value exactly once (the
    // mandatory, unavoidable step any reader performs just to read the
    // text node) to recover what it treats as this item's real HTML. A
    // single simultaneous-pass regex replace (not chained .replace calls)
    // matches how a real XML parser decodes entities in one left-to-right
    // scan over the ORIGINAL text, so it can't accidentally create or
    // consume an entity that was only produced by an earlier replacement.
    const match = xml.match(/<content:encoded>([\s\S]*?)<\/content:encoded>/);
    expect(match).toBeTruthy();
    const ENTITY_DECODE: Record<string, string> = {
      "&amp;": "&",
      "&lt;": "<",
      "&gt;": ">",
      "&quot;": '"',
      "&apos;": "'",
    };
    const oneUnescape = match![1].replace(
      /&amp;|&lt;|&gt;|&quot;|&apos;/g,
      (entity) => ENTITY_DECODE[entity]!,
    );

    // The hand-written structural tags come back as real, live HTML...
    expect(oneUnescape).toContain("<li>");
    expect(oneUnescape).toContain("<strong>");
    // ...but the untrusted payload is still inert escaped text, not a
    // live <script> tag, even after this one real unescape.
    expect(oneUnescape).not.toContain("<script>alert(1)</script>");
    expect(oneUnescape).toContain("&lt;script&gt;");
    // A literal "&" in the real title also still reads back as a single,
    // inert "&amp;" (not a raw "&" a downstream HTML parser could treat
    // as starting a new, different entity).
    expect(oneUnescape).toContain("&amp;");
  });

  it("(security fix) escapes a url containing attribute-breakout characters, closing a real script-tag-breakout gap an adversarial audit proved live", () => {
    // digestSchema.ts's httpUrlSchema only restricts the URL's *scheme*
    // (rejects javascript:/data:/etc.) - it does not escape or re-encode
    // the value, so an otherwise-valid http(s) URL containing a literal
    // '"'/'<'/'>' passes schema validation unchanged. Before this fix,
    // renderStoryListItem interpolated url raw into href="${url}", so a
    // url like this one broke out of the attribute and injected a real
    // <script> tag once a real RSS reader XML-unescaped content:encoded -
    // proven live via the actual @astrojs/rss builder during review.
    const fakeItem: DigestItem = {
      title: "A real story",
      source: "hn",
      url: 'http://evil.example.com/"><script>alert(document.cookie)</script>',
      date: "2026-09-04",
      tags: [],
      interest_score: 5,
      why_read: "A real reason.",
      authors: [],
    };

    const content = renderDayContent([fakeItem]);

    expect(content).not.toContain('"><script>alert(document.cookie)</script>');
    expect(content).toContain("&quot;&gt;&lt;script&gt;");
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
