// PRECONDITION: this is an e2e-style test that only READS already-built
// output — it never invokes the build itself. It assumes `npm run build`
// (i.e. `astro build`) has already run before this suite executes, matching
// this project's real CI step order: install, then build, then test. If you
// are running this locally, run `npm run build` first.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { DigestItemSchema } from "../src/lib/digestSchema.js";
import { formatReadingBadge } from "../src/lib/readingTime.js";
import { DIST_DIR, readAllPageCss } from "./testUtils.js";

const DIST_INDEX = join(DIST_DIR, "index.html");
const DIGEST_BASE = join(import.meta.dirname, "..", "src", "data", "digest");

// [^"]* after "lead-story" (not an immediate closing quote) tolerates any
// additional classes StoryCard.astro appends, e.g. "story-card lead-story
// has-image" - see the "(regression)" test below for why this matters
// with real data.
const LEAD_STORY_LI_REGEX =
  /<li class="story-card lead-story[^"]*"[^>]*>[\s\S]*?<\/li>/;

function findJsonFiles(base: string): string[] {
  return readdirSync(base, { recursive: true })
    .filter((entry) => typeof entry === "string" && entry.endsWith(".json"))
    .map((entry) => join(base, entry as string));
}

// The site only ever renders the LATEST date's items on the homepage
// (see groupEntriesByDate() + index.astro) - once more than one date is
// committed, any test that needs to match what's actually on the page
// must scope to that same date, not scan the whole multi-date archive.
// Real digest dates commit automatically via the daily-pipeline.yml
// cron, so a second (or third) date folder appearing mid-session is
// expected, real behavior, not a fixture to special-case around.
function findLatestDateJsonFiles(base: string): string[] {
  const latestDate = readdirSync(base)
    .filter((entry) => statSync(join(base, entry)).isDirectory())
    .sort()
    .at(-1);
  expect(
    latestDate,
    "expected at least one committed digest date",
  ).toBeTruthy();
  return findJsonFiles(join(base, latestDate as string));
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

  // (moved) These two tests asserted the Chart.js island bundled correctly
  // on the homepage. The chart moved to the owner-only /stats page in
  // Phase 5 (see docs/superpowers/plans/2026-09-04-newspaper-polish-and-owner-gating.md)
  // - equivalent coverage is added there against dist/stats/index.html.

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
    const distImagePath = join(DIST_DIR, imagePath);
    expect(
      existsSync(distImagePath),
      `expected og:image URL ${ogImageUrl} to resolve to a real file at ${distImagePath}`,
    ).toBe(true);
  });

  it("renders a real HN discussion link for HN-sourced stories", () => {
    // Scoped to the latest date only - the homepage never renders older
    // dates, so a hn-*.json file from an earlier archived date would
    // never appear in dist/index.html even though it's a real committed
    // file.
    const hnFile = findLatestDateJsonFiles(DIGEST_BASE).find((filePath) =>
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

  it("includes the Vercel Web Analytics script", () => {
    expect(
      html.includes("/_vercel/insights/script.js") ||
        html.includes("va.vercel-scripts.com"),
    ).toBe(true);
  });

  it("renders filter controls with a real All option for source and signal tier", () => {
    expect(html.includes('data-filter-group="source"')).toBe(true);
    expect(html.includes('data-filter-group="tier"')).toBe(true);
    expect(html.includes('data-filter-value="all"')).toBe(true);
  });

  it("(backlog) exposes filter-button state via aria-pressed, not color alone", () => {
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
  });

  it("(backlog) labels the source and tier filter rows and includes a live status line", () => {
    expect(html).toContain('id="filter-status"');
    expect(html).toContain('aria-live="polite"');
    // Static markup ships empty text - the client script fills it in on
    // load, so this only asserts the labeled rows exist, not the text.
    const filterBarMatch = html.match(
      /<div class="filter-bar"[^>]*>([\s\S]*?)<\/div>\s*<p class="empty-state"/,
    );
    expect(filterBarMatch, "expected the filter-bar markup").toBeTruthy();
    expect(filterBarMatch![1]).toContain("Source");
    expect(filterBarMatch![1]).toContain("Tier");
  });

  it("tags every story card with its source and interest tier", () => {
    expect(html.includes("data-source=")).toBe(true);
    expect(html.includes("data-interest-tier=")).toBe(true);
  });

  it("includes the static empty-state markup for when filters match no stories", () => {
    expect(html.includes('id="filter-empty-state"')).toBe(true);
    expect(html.includes("No stories match the selected filters.")).toBe(true);
  });

  it("does not link to Methodology anywhere on the homepage", () => {
    // Methodology is deliberately never advertised to readers (nav or
    // footer) - a third-person reader has no use for the scoring rubric.
    // The page itself still exists and works if linked directly.
    expect(html).not.toContain('href="/methodology"');
  });

  it("renders the correct reading-time badge for every latest-date item, matching formatReadingBadge()'s real output for the real committed data", () => {
    // Deriving the expected badge from the real formatReadingBadge()
    // function against whatever is actually committed today - rather
    // than hardcoding an assumption about which fallback state exists -
    // keeps this robust as the daily-pipeline.yml cron adds real new
    // data (which may or may not include items missing reading_minutes)
    // without needing a rewrite every time that mix changes.
    const items = findLatestDateJsonFiles(DIGEST_BASE).map((filePath) =>
      DigestItemSchema.parse(JSON.parse(readFileSync(filePath, "utf-8"))),
    );
    expect(items.length).toBeGreaterThan(0);

    const expectedBadges = new Set(
      items.map((item) => formatReadingBadge(item)),
    );
    for (const badge of expectedBadges) {
      expect(html, `expected a reading badge showing "${badge}"`).toContain(
        `>${badge}<`,
      );
    }
  });

  it("bootstraps skin and theme from localStorage before paint via an inline head script", () => {
    const headMatch = html.match(/<head[^>]*>[\s\S]*?<\/head>/i);
    expect(headMatch, "expected a <head> section").toBeTruthy();
    const head = headMatch![0];
    expect(head).toContain("documentElement.dataset.skin");
    expect(head).toContain('localStorage.getItem("skin")');
  });

  it("loads all four redesign Google Fonts", () => {
    expect(html).toContain("Space+Grotesk");
    expect(html).toContain("JetBrains+Mono");
    expect(html).toContain("Fraunces");
    expect(html).toContain("Newsreader");
  });

  it("(feature flag) never renders the Dev/Newspaper skin toggle by default - Newspaper is the only skin, and the theme toggle is enabled", () => {
    // Dev-editorial mode is a build-time feature flag (ENABLE_DEV_MODE),
    // off by default - see Layout.astro/PreferenceControls.astro. A
    // default `npm run build` (no env var set, matching real CI and
    // production) must never expose the skin-toggle UI at all, and the
    // light/dark theme toggle (Newspaper's own, unrelated feature) must
    // be enabled by default now that Newspaper is always the active skin.
    expect(html).not.toContain('id="skin-toggle-dev"');
    expect(html).not.toContain('id="skin-toggle-newspaper"');
    expect(html).toMatch(/id="theme-toggle"[^>]*>/);
    expect(html).not.toMatch(/id="theme-toggle"[^>]*disabled/);
  });

  it("(audit fix) wraps the header utility row on narrow viewports so it never renders under the fixed preference-controls", () => {
    // Regression test for a real bug found during a post-redesign E2E
    // audit: the mobile-nav-vs-preference-controls fix shipped earlier
    // was only verified against 2-link navs (archive pages); the
    // homepage's 3-link nav fit within its container without needing to
    // wrap, so flex-wrap alone never triggered - it just rendered
    // underneath the fixed-position controls layered on top at 375px,
    // confirmed via live getBoundingClientRect overlap. The fix reserves
    // horizontal space via padding-right so a 3rd link is forced onto a
    // new row instead of sitting under the fixed overlay. Moved from
    // .site-nav to .masthead-utility once the date-jump control joined
    // nav in one shared utility row (2026-09-05 masthead-composition
    // pass) - both children need the same mobile-safe treatment now.
    const style = readAllPageCss(html);
    const mobileNavRule =
      /@media\s*\(max-width:\s*480px\)\s*\{[^}]*\.masthead-utility\s*\{[^}]*flex-wrap:\s*wrap[^}]*padding-right:[^}]*\}/;
    expect(
      style,
      "expected a @media(max-width:480px) .masthead-utility rule with flex-wrap:wrap and a padding-right reservation",
    ).toMatch(mobileNavRule);
  });

  it("(regression) lead-story <li> regex tolerates additional classes like has-image", () => {
    // Real committed data can have the max-score lead story also be an
    // item with a real image_url (confirmed: 2026-09-05's real Bedrock run
    // produced exactly this - 3 of 4 tied top-score items had image_url
    // set). StoryCard.astro's class list is `story-card lead-story
    // has-image` in that case, not just `story-card lead-story` - a regex
    // requiring the class attribute to close immediately after
    // "lead-story" never matches that real, live combination. This test
    // pins the fix with a synthetic fixture, independent of whatever
    // today's real committed data happens to contain.
    const syntheticHtml =
      '<li class="story-card lead-story has-image" data-source="hn" data-interest-tier="must-read"><a class="story-title" href="#">Test Title</a></li>';
    const leadMatch = syntheticHtml.match(LEAD_STORY_LI_REGEX);
    expect(
      leadMatch,
      "expected the lead-story <li> regex to match even when has-image is also present",
    ).toBeTruthy();
  });

  it("marks the highest-scored story as the lead story", () => {
    // Scoped to the latest date only, matching what groupEntriesByDate()
    // + index.astro actually render - the globally-highest-scored item
    // across ALL committed dates is not necessarily on the homepage once
    // more than one date exists.
    //
    // (audit fix) Real committed data can have a genuine tie at the top
    // score (confirmed: a live 4-way 7.0 tie on 2026-09-03). Array.sort
    // is stable, so a tie's winner depends on each side's PRE-sort
    // ordering - this test's own readdirSync-based file order and
    // Astro's content-collection glob-loader order are not guaranteed to
    // agree, so asserting a specific tied title is not a real
    // requirement and breaks whenever the tied set or its order shifts.
    // The actual invariant index.astro promises is "the lead story has
    // no lower a score than any other visible item" - assert that
    // instead of a specific winner.
    const items = findLatestDateJsonFiles(DIGEST_BASE).map((filePath) =>
      DigestItemSchema.parse(JSON.parse(readFileSync(filePath, "utf-8"))),
    );
    const maxScore = Math.max(...items.map((item) => item.interest_score));
    const topTitles = new Set(
      items
        .filter((item) => item.interest_score === maxScore)
        .map((item) => item.title),
    );
    expect(
      topTitles.size,
      "expected at least one committed digest item",
    ).toBeGreaterThan(0);

    const leadMatch = html.match(LEAD_STORY_LI_REGEX);
    expect(leadMatch, "expected a .lead-story <li>").toBeTruthy();
    const leadTitleMatch = leadMatch![0].match(
      /<a class="story-title"[^>]*>\s*([\s\S]*?)\s*<\/a>/,
    );
    expect(
      leadTitleMatch,
      "expected a .story-title link inside the lead story",
    ).toBeTruthy();
    const leadTitle = leadTitleMatch![1].trim();
    expect(
      topTitles.has(leadTitle),
      `expected the lead story ("${leadTitle}") to be one of the max-score (${maxScore}) items: ${JSON.stringify([...topTitles])}`,
    ).toBe(true);
  });

  it("(review fix) uses the exact why_read string as the info button's accessible label", () => {
    // Scoped to the latest date only - a sample item from an older,
    // no-longer-rendered date would never appear in dist/index.html.
    const items = findLatestDateJsonFiles(DIGEST_BASE).map((filePath) =>
      DigestItemSchema.parse(JSON.parse(readFileSync(filePath, "utf-8"))),
    );
    const sample = items[0];
    // Deliberately includes a short context prefix ("Why this made the
    // cut: ") rather than the bare why_read string alone — a raw
    // sentence with no label is worse for screen-reader users than one
    // with context, per general ARIA-label practice. This is a
    // documented, intentional refinement over the spec's literal "the
    // full why_read string" wording, not an oversight (spec Section 6).
    expect(html).toContain(
      `aria-label="Why this made the cut: ${sample.why_read}"`,
    );
  });

  it("applies a multi-column layout to the story list only under the Newspaper skin, with display reset from the shared flex base", () => {
    // Reads inline <style> tags AND any linked /_astro/*.css files: Astro's
    // build.inlineStylesheets:"auto" default only inlines a page's CSS
    // below a ~4096-byte threshold, so this component's rules may land in
    // either place depending on total bundled chunk size at build time —
    // that's a build-chunking detail, not something this test should be
    // sensitive to.
    const style = readAllPageCss(html);
    expect(style, "expected a .story-list rule in the page's CSS").toContain(
      "story-list",
    );
    // CSS minification strips quotes from attribute-selector values (e.g.
    // [data-skin='newspaper'] -> [data-skin=newspaper]), so match either
    // quoting style rather than assuming the unminified form survives.
    const newspaperSkinSelector = /\[data-skin=['"]?newspaper['"]?\]/;
    expect(style).toMatch(newspaperSkinSelector);
    expect(style).toContain("column-count");
    // (review fix, critical) .story-list's base rule sets display:flex;
    // without an explicit reset here, column-count has zero effect —
    // verified empirically in a real browser during plan review.
    // Astro's scoped-style hashing appends a `[data-astro-cid-*]` attribute
    // selector directly after the class (e.g. `.story-list[data-astro-cid-xyz]`),
    // so the pattern allows an optional attribute selector between the
    // class name and the opening brace.
    expect(style).toMatch(
      /\[data-skin=['"]?newspaper['"]?\][^{]*\.story-list(\[[^\]]*\])?\s*\{[^}]*display:\s*block/,
    );
  });

  it("(review fix, critical) repositions the 'Top Pick' eyebrow under Newspaper skin so the drop-cap binds to the real headline while the label still renders", () => {
    // Regression test for a real bug: the base (Dev-skin) rule
    // `.lead-story .story-title::before { content: 'Top Pick'; }` generates
    // non-empty content, and per the CSS spec ::first-letter binds to the
    // first letter of the element's "first formatted line" - which includes
    // a non-empty ::before's generated content when present. Without an
    // override, the Newspaper drop-cap floats the "T" of "Top Pick" instead
    // of the real headline's first letter - verified live in a browser
    // during review.
    //
    // The fix takes the eyebrow out of normal flow (position: absolute on
    // the ::before, position: relative + padding-top on the parent) rather
    // than removing it (content: none), since absolutely-positioned
    // generated content is excluded from the in-flow "first formatted
    // line" that ::first-letter considers - so the drop-cap still binds
    // correctly AND the "Top Pick" label still renders. If either rule
    // is ever removed or reordered relative to the base rule such that it
    // no longer wins the cascade, this test must fail.
    const style = readAllPageCss(html);
    const newspaperSkinSelector = /\[data-skin=['"]?newspaper['"]?\]/;
    expect(style).toMatch(newspaperSkinSelector);

    // Astro auto-scopes `.lead-story` and `.story-title` (written outside
    // `:global()`) with a `[data-astro-cid-*]` attribute selector each, and
    // CSS minification collapses `::before` to `:before` and may strip
    // quotes from the attribute value - tolerate all of that, the same way
    // the multi-column test above does.
    const titlePositionRule =
      /\[data-skin=['"]?newspaper['"]?\][^{]*\.lead-story(\[[^\]]*\])?\s+\.story-title(\[[^\]]*\])?\s*\{[^}]*position:\s*relative/;
    expect(
      style,
      "expected a Newspaper-scoped .lead-story .story-title rule setting position: relative",
    ).toMatch(titlePositionRule);

    const dropCapOverrideRule =
      /\[data-skin=['"]?newspaper['"]?\][^{]*\.lead-story(\[[^\]]*\])?\s+\.story-title(\[[^\]]*\])?:{1,2}before\s*\{[^}]*content:\s*['"]?Top Pick['"]?[^}]*position:\s*absolute/;
    expect(
      style,
      "expected a Newspaper-scoped .lead-story .story-title::before rule keeping content: 'Top Pick' but with position: absolute",
    ).toMatch(dropCapOverrideRule);
  });

  it("(backlog fix) gives nav links, story headlines, and Discuss links a themed :focus-visible ring", () => {
    // A post-redesign audit found these three link types had no custom
    // :focus-visible rule at all, falling back to the browser's fixed
    // default outline color instead of the theme-matched --accent ring
    // every other interactive element in this UI already gets.
    const style = readAllPageCss(html);
    expect(style).toMatch(
      /\.site-nav a:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/,
    );
    expect(style).toMatch(
      /\.story-title(\[[^\]]*\])?:focus-visible[^{]*\.discuss-link(\[[^\]]*\])?:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/,
    );
  });

  it("(Phase 1) uses @container instead of @media for newspaper column-count breakpoints", () => {
    const style = readAllPageCss(html);
    expect(style).not.toMatch(/@media\s*\(max-width:\s*1000px\)/);
    expect(style).not.toMatch(/@media\s*\(max-width:\s*640px\)/);
    expect(style).toMatch(/@container\s+story-list\s*\(min-width:\s*480px\)/);
    expect(style).toMatch(/@container\s+story-list\s*\(min-width:\s*700px\)/);
  });

  it("(Phase 1) establishes a container-query context around .story-list", () => {
    const style = readAllPageCss(html);
    expect(style).toMatch(
      /\.story-list-container(\[[^\]]*\])?\s*\{[^}]*container-type:\s*inline-size/,
    );
  });

  it("(Phase 1) gives the hairline divider a low-opacity token, not the stronger --rule token", () => {
    const style = readAllPageCss(html);
    expect(style).toMatch(
      /\.story-card(\[[^\]]*\])?\s*\{[^}]*border-bottom:\s*1px solid var\(--rule-soft\)/,
    );
  });

  it("(Phase 1) applies tiered left-border weight via the existing data-interest-tier attribute", () => {
    const style = readAllPageCss(html);
    expect(style).toMatch(
      /\.story-card(\[[^\]]*\])?\[data-interest-tier=['"]?must-read['"]?\][^{]*\{[^}]*border-left:\s*3px solid var\(--accent\)/,
    );
  });

  it("(Phase 2) lays the story list out as a bento grid with a 4x2 hero cell, dev skin", () => {
    // (deviation from plan text, documented) The plan's original regex for
    // the second half of this assertion used `[^}]*` between the
    // @container prelude and `.lead-story`, which requires zero `}`
    // characters in between. But `.story-card` must be declared BEFORE
    // `.lead-story` inside this same @container block (verified against
    // the real, minified build output) - the lead <li> carries both
    // classes, so with equal-specificity single-class selectors, source
    // order decides the cascade winner. Putting `.lead-story` first would
    // let `.story-card`'s `grid-column: span 2` win instead of `span 4`,
    // silently breaking the actual hero-cell layout just to satisfy a
    // stricter regex. This version uses a non-greedy `[\s\S]*?` so it can
    // cross the intervening `.story-card { ... }` block's closing brace
    // while still finding the real `.lead-story` rule inside the same
    // @container block, preserving the assertion's original intent.
    const style = readAllPageCss(html);
    expect(style).toMatch(/\.story-list(\[[^\]]*\])?\s*\{[^}]*display:\s*grid/);
    expect(style).toMatch(
      /@container\s+story-list\s*\(min-width:\s*640px\)\s*\{[\s\S]*?\.lead-story(\[[^\]]*\])?\s*\{[^}]*grid-column:\s*span 4[^}]*grid-row:\s*span 2/,
    );
  });

  it("(Phase 2) preserves Newspaper's flowing-column card look (no grid border on newspaper cards)", () => {
    const style = readAllPageCss(html);
    expect(style).toMatch(
      /\[data-skin=['"]?newspaper['"]?\][^{]*\.story-card(\[[^\]]*\])?\s*\{[^}]*border:\s*none/,
    );
  });

  it("(Phase 2) replaces the hover-only 'why read' reveal with a click-toggle, aria-expanded-driven one", () => {
    const style = readAllPageCss(html);
    expect(style).not.toMatch(/\.why-wrap:hover\s+\.why-tooltip/);
    expect(style).toMatch(
      /\.why-icon(\[[^\]]*\])?\[aria-expanded=['"]?true['"]?\]\s*\+\s*\.why-tooltip/,
    );
    expect(html).toContain('aria-expanded="false"');
    const controlsIds = [...html.matchAll(/aria-controls="([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(controlsIds.length).toBeGreaterThan(0);
    for (const id of controlsIds) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it("(Phase 3) defines a hero/feature image slot and a feature-tile grid span for imaged items", () => {
    const style = readAllPageCss(html);
    expect(style).toMatch(
      /\.story-image(\[[^\]]*\])?\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9/,
    );
    expect(style).toMatch(
      /\.story-image(\[[^\]]*\])?\s*\{[^}]*object-fit:\s*contain/,
    );
    expect(style).toMatch(
      /\.story-image(\[[^\]]*\])?\s*\{[^}]*background:\s*var\(--bg-surface\)/,
    );
    // Astro's scoped-style hashing inserts [data-astro-cid-*] right after the
    // FIRST simple selector in a compound chain, not after every class - the
    // real build output is `.story-card[data-astro-cid-x].has-image:not(...)`,
    // matching every other compound-selector pattern in this file (e.g. the
    // [data-interest-tier=...] checks above), not `.story-card.has-image[data-astro-cid-x]`.
    expect(style).toMatch(
      /\.story-card(\[[^\]]*\])?\.has-image:not\(\.lead-story\)\s*\{[^}]*grid-column:\s*span 3/,
    );
  });

  it("(Phase 3) renders a real <img> for any committed item that already has an image_url", () => {
    const itemsWithImages = findLatestDateJsonFiles(DIGEST_BASE)
      .map((p) => DigestItemSchema.parse(JSON.parse(readFileSync(p, "utf-8"))))
      .filter(
        (item): item is typeof item & { image_url: string } =>
          typeof item.image_url === "string",
      );

    if (itemsWithImages.length === 0) {
      // Expected immediately after this feature ships, before the next
      // pipeline cron run has produced any item with a real image_url yet.
      // Deliberate early return, not a weak test - once real data exists
      // the loop below exercises the real assertion.
      return;
    }

    for (const item of itemsWithImages) {
      expect(html).toContain(item.image_url);
    }
  });

  it("(Phase 4, optional) guards any new hover motion behind prefers-reduced-motion, matching existing convention", () => {
    const style = readAllPageCss(html);
    if (!style.includes("translateY(-1px)")) return; // Phase 4 was skipped - fine.
    expect(style).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*no-preference\)[\s\S]*?\.story-card(\[[^\]]*\])?:hover/,
    );
  });

  it("(Phase 4, fix) excludes hover transform from newspaper skin by explicitly resetting it", () => {
    const style = readAllPageCss(html);
    if (!style.includes("translateY(-1px)")) return; // Phase 4 was skipped - fine.
    // Verify that newspaper skin's .story-card:hover includes transform: none
    // to prevent the base hover rule's translateY from leaking through.
    expect(style).toMatch(
      /\[data-skin=['"]?newspaper['"]?\][^{]*\.story-card(\[[^\]]*\])?:hover[\s\S]*?transform:\s*none/,
    );
  });

  it("(backlog) explicitly resets border-color on Newspaper's card-hover state, not just via source-order", () => {
    const style = readAllPageCss(html);
    if (!style.includes("translateY(-1px)")) return; // Phase 4 was skipped - fine.
    expect(style).toMatch(
      /\[data-skin=['"]?newspaper['"]?\][^{]*\.story-card(\[[^\]]*\])?:hover\s*\{[^}]*border-color:\s*transparent/,
    );
  });

  it("(backlog) footer is a minimal colophon, not the AI-disclosure banner", () => {
    expect(html).not.toContain("Curation is AI-scored by default");
    expect(html).not.toMatch(
      /<footer[^>]*>[\s\S]*?href="\/stats"[\s\S]*?<\/footer>/,
    );
    const footerMatch = html.match(/<footer[^>]*>([\s\S]*?)<\/footer>/);
    expect(footerMatch, "expected a <footer> on the homepage").toBeTruthy();
    expect(footerMatch![1]).toContain('href="/rss.xml"');
    expect(footerMatch![1]).toMatch(/©\s*\d{4}/);
  });

  it("(backlog) declutters the top nav for casual readers - Methodology no longer advertised anywhere", () => {
    // A third-person/casual reader has no use for a link to the scoring
    // rubric - not in primary navigation, and (per a later revisit) not
    // in the footer either. The page itself is unaffected and still
    // directly reachable by URL; it's just never surfaced in the UI.
    const navMatch = html.match(
      /<nav[^>]*class="site-nav"[^>]*>([\s\S]*?)<\/nav>/,
    );
    expect(navMatch, "expected a .site-nav").toBeTruthy();
    expect(navMatch![1]).not.toContain('href="/methodology"');

    const footerMatch = html.match(/<footer[^>]*>([\s\S]*?)<\/footer>/);
    expect(footerMatch![1]).not.toContain('href="/methodology"');
  });

  it("(backlog) does not render a numeric interest-score badge publicly", () => {
    expect(html).not.toContain('class="score-badge');
    const style = readAllPageCss(html);
    expect(style).not.toMatch(/\.score-badge\s*\{/);
  });

  it("(backlog) still renders [data-interest-tier] with its border-weight CSS (tier hierarchy survives)", () => {
    expect(html).toMatch(
      /data-interest-tier="(must-read|recommended|notable)"/,
    );
    const style = readAllPageCss(html);
    expect(style).toMatch(
      /\[data-interest-tier=['"]?must-read['"]?\]\s*\{[^}]*border/,
    );
  });

  it("(backlog) does not render the interest-score chart on the homepage", () => {
    expect(html).not.toContain('id="score-chart"');
    expect(html).not.toContain("Interest scores");
  });

  it("(backlog) centers the masthead and the utility row (legacy-newspaper identity)", () => {
    // justify-content:center moved from .site-nav to .masthead-utility
    // once the date-jump control joined nav in one shared utility row
    // (the 2026-09-05 masthead-composition pass) - .site-nav itself no
    // longer needs its own justify-content, it's centered as a member
    // of its parent's centered flex row.
    const style = readAllPageCss(html);
    expect(style).toMatch(/\.masthead\s*\{[^}]*text-align:\s*center/);
    expect(style).toMatch(
      /\.masthead-utility\s*\{[^}]*justify-content:\s*center/,
    );
  });

  it("(regression) constrains .masthead's own box to main's exact width, so its border-bottom rule doesn't render full-bleed while the body renders in a narrower centered column", () => {
    // Confirmed directly against tdd.cat's real layout (Playwright,
    // getBoundingClientRect): its masthead-to-body separator is sized to
    // its content column's exact width, never full-bleed. Without this,
    // .masthead had no max-width of its own (only its CHILDREN did), so
    // its border-bottom rendered edge-to-edge across the whole viewport on
    // wide screens while every heading/filter/card beneath it sat in a
    // much narrower centered column.
    const style = readAllPageCss(html);
    const mastheadBlock = style.match(/\.masthead\s*\{([^}]*)\}/);
    expect(mastheadBlock, "expected a .masthead rule").toBeTruthy();
    expect(mastheadBlock![1]).toMatch(/max-width:\s*1100px/);
    expect(mastheadBlock![1]).toMatch(/margin:\s*0\s+auto/);
  });

  it("(backlog fix) reverts the utility row to flex-start inside the mobile breakpoint, preserving the padding-right overlap fix", () => {
    // justify-content: center defeats the mobile padding-right
    // reservation's own assumption (a left-packed row never drifts
    // toward the reserved zone) - confirmed empirically via Playwright
    // at 375px to reintroduce real overlap with the fixed
    // preference-controls. This asserts the mobile override survives
    // regardless of how the base .masthead-utility rule's declarations
    // get reordered later.
    const style = readAllPageCss(html);
    const mobileOverride =
      /@media\s*\(max-width:\s*480px\)\s*\{[^}]*\.masthead-utility\s*\{[^}]*justify-content:\s*flex-start[^}]*\}/;
    expect(
      style,
      "expected the @media(max-width:480px) .masthead-utility rule to revert justify-content to flex-start",
    ).toMatch(mobileOverride);
  });

  it("(backlog) reserves enough mobile space for PreferenceControls' real width, not just a bare toggle circle", () => {
    // The original 60px reservation (Phase 3) was sized for a plain
    // theme-toggle circle and was already borderline - adding the
    // date-jump input to this same row (masthead-composition pass)
    // finally pushed real content past it, confirmed via Playwright
    // getBoundingClientRect showing ~16px of real overlap at a 400px
    // effective viewport. PreferenceControls' skin-toggle pill ("DEV" +
    // "NEWSPAPER" text) measured ~144px wide + 16px right margin = an
    // effective ~160px needed; 180px is that measurement plus a buffer.
    // Assert the reservation is comfortably above the measured minimum
    // rather than pinning the exact value, so a future intentional
    // adjustment doesn't have to touch this test unless it regresses
    // below the real minimum.
    const style = readAllPageCss(html);
    const match = style.match(
      /@media\s*\(max-width:\s*480px\)\s*\{[^}]*\.masthead-utility\s*\{[^}]*padding-right:\s*(\d+)px/,
    );
    expect(match, "expected a padding-right:<N>px reservation").toBeTruthy();
    expect(Number(match![1])).toBeGreaterThanOrEqual(160);
  });

  it("(backlog) groups the utility row and brand block with an internal-≤-external spacing hierarchy", () => {
    // The masthead used to just stack 4 independently-centered rows
    // with whatever margin each element's own rule happened to set
    // (0px between nav and the date input, 8px before the brand block,
    // then only 4px between the h1 and tagline - smaller than the gap
    // above it, backwards from any real grouping). Assert the fixed
    // hierarchy directly: the gap between the two distinct groups
    // (.masthead-utility's margin-bottom) must be strictly larger than
    // the gap within the brand block (.tagline's margin-top).
    const style = readAllPageCss(html);
    const utilityMarginMatch = style.match(
      /\.masthead-utility\s*\{[^}]*margin-bottom:\s*([\d.]+)rem/,
    );
    const taglineMarginMatch = style.match(
      /\.tagline\s*\{[^}]*margin:\s*([\d.]+)rem/,
    );
    expect(
      utilityMarginMatch,
      "expected .masthead-utility margin-bottom",
    ).toBeTruthy();
    expect(
      taglineMarginMatch,
      "expected .tagline's margin-top (first value in its margin shorthand)",
    ).toBeTruthy();
    expect(Number(utilityMarginMatch![1])).toBeGreaterThan(
      Number(taglineMarginMatch![1]),
    );
  });

  it("(backlog) groups nav and the date-jump control into one shared utility row, not two independently-centered rows", () => {
    const utilityMatch = html.match(
      /<div[^>]*class="masthead-utility"[^>]*>([\s\S]*?)<\/div>/,
    );
    expect(utilityMatch, "expected a .masthead-utility wrapper").toBeTruthy();
    expect(utilityMatch![1]).toContain('class="site-nav"');
    expect(utilityMatch![1]).toContain('id="date-jump"');

    const brandMatch = html.match(
      /<hgroup[^>]*class="masthead-brand"[^>]*>([\s\S]*?)<\/hgroup>/,
    );
    expect(
      brandMatch,
      'expected an <hgroup class="masthead-brand"> wrapping the H1 and tagline',
    ).toBeTruthy();
    expect(brandMatch![1]).toContain("<h1");
    expect(brandMatch![1]).toContain('class="tagline"');
  });

  it("(backlog) renders the Logo mark in the masthead, with a skin-appropriate variant for each of the 3 palette states", () => {
    expect(html).toContain('class="logo-mark logo-mark-dev"');
    expect(html).toContain('class="logo-mark logo-mark-newspaper-light"');
    expect(html).toContain('class="logo-mark logo-mark-newspaper-dark"');
    const style = readAllPageCss(html);
    expect(style).toMatch(
      /\.logo-mark-newspaper-light\s*\{[^}]*display:\s*block/,
    );
    expect(style).toMatch(
      /\.logo-mark-newspaper-dark\s*\{[^}]*display:\s*none/,
    );
    expect(style).toMatch(
      /\[data-skin=['"]?dev['"]?\][^{]*\.logo-mark-dev\s*\{[^}]*display:\s*block/,
    );
  });

  it("(backlog) the homepage nav no longer links to the now-gated /stats page", () => {
    expect(html).not.toMatch(
      /<nav[^>]*class="site-nav"[^>]*>[\s\S]*?href="\/stats"/,
    );
  });

  it("(backlog) renders a date-jump control in the masthead, bounded to real digest dates", () => {
    expect(html).toMatch(/<input[^>]*type="date"[^>]*id="date-jump"/);
    const minMatch = html.match(/id="date-jump"[^>]*min="(\d{4}-\d{2}-\d{2})"/);
    const maxMatch = html.match(/id="date-jump"[^>]*max="(\d{4}-\d{2}-\d{2})"/);
    expect(
      minMatch,
      "expected a min= bound to the earliest real digest date",
    ).toBeTruthy();
    expect(
      maxMatch,
      "expected a max= bound to the latest real digest date",
    ).toBeTruthy();
  });
});

describe("dist/favicon.svg", () => {
  it("(backlog) is the new sunrise-glyph mark, not the old 'dd' monogram", () => {
    const svgPath = join(DIST_DIR, "favicon.svg");
    expect(existsSync(svgPath), `expected ${svgPath} to exist`).toBe(true);
    const svg = readFileSync(svgPath, "utf-8");
    expect(svg).not.toContain(">dd<");
    expect(svg).toContain('r="7"');
    expect(svg).toMatch(/prefers-color-scheme:\s*dark/);
  });
});
