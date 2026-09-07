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

  it("(regression) collapses the filter pills behind a mobile-only Filters toggle instead of letting 9 pills wrap into ragged rows", () => {
    // Confirmed via a live inspection of tdd.cat's own equivalent filter
    // bar (its .filter-mobile-trigger, at the identical 600px
    // breakpoint): the toggle button and its aria-expanded/aria-controls
    // wiring ship in every build; the CSS media query is what actually
    // hides the pill groups on narrow viewports and reveals them via a
    // JS-toggled class.
    expect(html).toContain('id="filter-toggle"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="filter-row-main"');
    expect(html).toContain('id="filter-row-main"');

    const style = readAllPageCss(html);
    expect(style).toMatch(
      /@media\s*\(max-width:\s*600px\)\s*\{[^]*?\.filter-row-main(\[[^\]]*\])?\s*\{[^}]*display:\s*none/,
    );
    expect(style).toMatch(
      /\.filter-bar(\[[^\]]*\])?\.filters-open \.filter-row-main(\[[^\]]*\])?\s*\{[^}]*display:\s*flex/,
    );
  });

  it("(regression) lays out Source and Tier as one row split across the full width, not two stacked left-packed rows", () => {
    // Confirmed directly against tdd.cat's real Source/Signal filter row
    // (Playwright-measured): filling the content column's full width via
    // space-between, not clustering both groups on one side.
    const style = readAllPageCss(html);
    // Astro's scoped-style hashing appends a `[data-astro-cid-*]` attribute
    // selector directly after the class name - tolerate it here too.
    expect(style).toMatch(
      /\.filter-row-main(\[[^\]]*\])?\s*\{[^}]*justify-content:\s*space-between/,
    );
  });

  it("(regression) keeps the utility row to exactly three zones - nav / older-day-link / theme toggle - no story-count 4th zone", () => {
    // The "N stories" zone was tried and removed - the reader already
    // sees the exact same count on the section heading + filter status
    // line directly below, so repeating it in the masthead was pure
    // duplication. Left/middle/right spread via the shared
    // .masthead-utility justify-content:space-between.
    expect(html).not.toContain('class="story-count"');
    expect(html).not.toMatch(/\d+\s+stor(y|ies)</);
    const utilityMatch = html.match(
      /<div[^>]*class="masthead-utility"[^>]*>([\s\S]*?)<\/div>\s*<hgroup/,
    );
    expect(utilityMatch, "expected a .masthead-utility wrapper").toBeTruthy();
    expect(utilityMatch![1]).toContain('class="site-nav"');
    expect(utilityMatch![1]).toContain('class="date-nav"');
    expect(utilityMatch![1]).toContain('id="theme-toggle"');
  });

  it("tags every story card with its source and interest tier", () => {
    expect(html.includes("data-source=")).toBe(true);
    expect(html.includes("data-interest-tier=")).toBe(true);
  });

  it("renders an inline SVG source icon before each source-badge's text label", () => {
    // Checked per-source (not asserting all 4 unconditionally): real
    // committed data rotates daily via the cron pipeline, and a given
    // day's digest is not guaranteed to include an item from every one
    // of the 4 known sources (see AGENTS.md - sourcing is real, not a
    // fixed fixture). At least one of the 4 is still required so this
    // can't vacuously pass on a page with no badges at all.
    const knownSources = ["hn", "arxiv", "github", "devto"] as const;
    let matchedAtLeastOneSource = false;

    for (const src of knownSources) {
      const badgeMatch = html.match(
        new RegExp(
          `<span class="source-badge source-badge-${src}"[^>]*>([\\s\\S]*?)</span>`,
        ),
      );
      if (!badgeMatch) continue;
      matchedAtLeastOneSource = true;

      expect(
        badgeMatch[1],
        `expected the "${src}" source-badge's inner markup to start with an <svg> immediately followed by "${src}"`,
      ).toMatch(new RegExp(`^<svg[^>]*>[\\s\\S]*?</svg>${src}$`));
    }

    expect(
      matchedAtLeastOneSource,
      "expected at least one hn/arxiv/github/devto source-badge in today's committed digest",
    ).toBe(true);
  });

  it("includes the static empty-state markup for when filters match no stories", () => {
    expect(html.includes('id="filter-empty-state"')).toBe(true);
    expect(html.includes("No stories match the selected filters.")).toBe(true);
  });

  it("(regression) announces the filter empty state to screen readers - it's dynamically toggled via `hidden` but wasn't wired to any live region", () => {
    // Confirmed via deep research: role="status" (which implies
    // aria-live="polite") plus an explicit redundant aria-live="polite"
    // is the correct, unanimous ARIA fix so the zero-results moment is
    // announced non-disruptively (no focus theft) - previously this
    // paragraph had neither, a confirmed WCAG 4.1.3 violation.
    expect(html).toMatch(
      /<p[^>]*id="filter-empty-state"[^>]*role="status"[^>]*aria-live="polite"/,
    );
  });

  it("(regression) gives the empty-state message real typographic prominence instead of small, muted text that's easy to miss", () => {
    // Confirmed via deep research (NN/g eyetracking): a small, low-
    // contrast no-results message was never even fixated on by real
    // users in that study. Uses the site's own existing display-font/
    // hairline-rule vocabulary (already used for section boundaries
    // elsewhere) rather than a new icon/illustration dependency, per
    // SOUL.md's no-clickbait mandate and real editorial "nothing here"
    // precedent (ESPN's bare-text scoreboard empty state) that favors
    // plain typography over decoration.
    const style = readAllPageCss(html);
    expect(style).toMatch(
      /\.empty-state\s*\{[^}]*font-family:\s*var\(--font-display\)/,
    );
    expect(style).toMatch(/\.empty-state\s*\{[^}]*border-top:/);
    expect(style).not.toMatch(
      /\.empty-state\s*\{[^}]*color:\s*var\(--ink-soft\)/,
    );
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

  it("(regression) renders the theme toggle as a normal in-flow child of the utility row, not a viewport-fixed overlay", () => {
    // Confirmed via deep research: an editorial theme toggle belongs
    // inline in the header (real precedent: tdd.cat, clagnut.com), not
    // floating in a viewport corner - the SaaS-dashboard convention.
    // Moving it out of Layout.astro's fixed-position overlay and into
    // this row also obsoletes the old mobile padding-right reservation
    // that used to protect against exactly this element overlapping
    // content when it WAS fixed - normal flex-wrap now handles narrow
    // viewports correctly since the toggle is a real flex child.
    const style = readAllPageCss(html);
    const utilityMatch = html.match(
      /<div[^>]*class="masthead-utility"[^>]*>([\s\S]*?)<\/div>/,
    );
    expect(utilityMatch, "expected a .masthead-utility wrapper").toBeTruthy();
    expect(utilityMatch![1]).toContain('id="theme-toggle"');
    expect(style).not.toMatch(
      /\.preference-controls\s*\{[^}]*position:\s*fixed/,
    );
    expect(style).toMatch(/\.masthead-utility\s*\{[^}]*flex-wrap:\s*wrap/);
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

  describe("global :focus-visible fallback (audit fix)", () => {
    it("Layout.astro defines a global :focus-visible fallback ahead of per-component overrides", () => {
      const style = readAllPageCss(html);
      expect(style).toMatch(
        /(?<![\w\]]):focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/,
      );
    });
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

  it("(backlog) centers the masthead brand block; spreads the utility row's children to its edges", () => {
    // The masthead brand (h1/tagline) stays centered (legacy-newspaper
    // identity). The utility row itself switched from centered to
    // space-between once the theme toggle became a real in-flow child
    // of this row (moved out of a viewport-fixed overlay) - every
    // page's row now has ≥2 children (its own nav/date content, plus
    // the toggle) and reads better spread to the row's edges than
    // clustered in the middle.
    const style = readAllPageCss(html);
    expect(style).toMatch(/\.masthead\s*\{[^}]*text-align:\s*center/);
    expect(style).toMatch(
      /\.masthead-utility\s*\{[^}]*justify-content:\s*space-between/,
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

  it("(backlog) groups nav and the date-nav control into one shared utility row, not two independently-centered rows", () => {
    const utilityMatch = html.match(
      /<div[^>]*class="masthead-utility"[^>]*>([\s\S]*?)<\/div>/,
    );
    expect(utilityMatch, "expected a .masthead-utility wrapper").toBeTruthy();
    expect(utilityMatch![1]).toContain('class="site-nav"');
    expect(utilityMatch![1]).toContain('class="date-nav"');

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

  it("(regression) reorders the mobile masthead row so the date-nav (not the theme toggle) drops to its own full-width line", () => {
    // Confirmed via a live inspection of tdd.cat's own equivalent
    // masthead row: pin the nav link and theme toggle to the top row and
    // force .date-nav to the end + full width, instead of leaving it to
    // default DOM order (which previously stranded the toggle alone on
    // its own line at narrow widths).
    const style = readAllPageCss(html);
    expect(style).toMatch(
      /@media\s*\(max-width:\s*480px\)\s*\{[^}]*\.masthead-utility \.date-nav\s*\{[^}]*order:\s*3[^}]*width:\s*100%/,
    );
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

  it("(regression) wraps the whole page in a newspaper-only 'paper sheet' surface, distinct from the page background", () => {
    // Confirmed directly against tdd.cat's real masthead-through-footer
    // wrapper (Playwright-measured: a lighter --bg-surface-toned surface
    // with a real box-shadow, spanning the whole page, sitting on a
    // visibly darker --bg-page background outside it). Before this,
    // --bg-page and --bg-surface were defined but never applied as a
    // page-wide surface - every card/heading/rule sat directly on
    // --bg-page, with no differentiated "board" at all.
    expect(html).toContain('<div class="page-sheet">');
    const style = readAllPageCss(html);
    expect(style).toMatch(
      /\[data-skin=['"]?newspaper['"]?\]\s*\.page-sheet\s*\{[^}]*background:\s*var\(--bg-surface\)/,
    );
    expect(style).toMatch(
      /\[data-skin=['"]?newspaper['"]?\]\s*\.page-sheet\s*\{[^}]*box-shadow:/,
    );
  });

  it("(backlog) the homepage nav no longer links to the now-gated /stats page", () => {
    expect(html).not.toMatch(
      /<nav[^>]*class="site-nav"[^>]*>[\s\S]*?href="\/stats"/,
    );
  });

  it("(regression) replaces the native date-picker input with a real prev-day link, bounded to real digest dates - never a calendar widget", () => {
    // Confirmed via deep research: every real comparable editorial site
    // examined (tdd.cat, Daring Fireball, Stratechery, Friday Front-End)
    // uses a plain prev/next-day link or a flat chronological list for
    // date navigation, never a calendar/date-input widget - one confirmed
    // finding explicitly advises against custom calendar UI for "known
    // historical dates" and "very distant date ranges", exactly this
    // site's archive. Arbitrary jumps are handled by the existing
    // /archive/ list page (linked via "All digests"), not duplicated here.
    expect(html).not.toMatch(/<input[^>]*type="date"/);
    expect(html).not.toContain('id="date-jump"');

    // Real committed digest dates change over time (old dates get pruned,
    // the daily cron adds new ones) - assert whichever of index.astro's two
    // real branches actually applies right now, not "there must always be
    // ≥2 dates". With only the latest date committed, olderDate is null and
    // the disabled <span> branch is correct, not a bug.
    const committedDateCount = readdirSync(DIGEST_BASE, {
      withFileTypes: true,
    }).filter((entry) => entry.isDirectory()).length;

    if (committedDateCount > 1) {
      const olderLinkMatch = html.match(
        /<a href="\/archive\/(\d{4}-\d{2}-\d{2})\/"[^>]*>&larr; Older \(\1\)<\/a>/,
      );
      expect(
        olderLinkMatch,
        "expected an Older(<date>) link to the next real older digest date",
      ).toBeTruthy();
    } else {
      expect(html).toMatch(
        /<span class="date-nav-disabled"[^>]*>&larr; Older<\/span>/,
      );
    }
  });

  it("(regression) renders a scroll-to-top button, hidden by default, gated on real page length before it ever observes the real footer", () => {
    expect(html).toContain('id="scroll-to-top"');
    expect(html).toMatch(/<button[^>]*id="scroll-to-top"[^>]*hidden/);
    // The gate is a runtime scrollHeight check, not something a static
    // HTML/CSS snapshot can exercise - assert the actual gate logic and
    // the real-footer observer target are both present in the shipped
    // script, not an arbitrary fixed-scroll-distance sentinel.
    expect(html).toMatch(/scrollHeight\s*>\s*window\.innerHeight\s*\*\s*4/);
    expect(html).toMatch(/querySelector\(["']\.site-footer["']\)/);
  });

  it("(regression) tracks the scroll-to-top button's right offset to .page-sheet's real edge, not the viewport's edge", () => {
    // Confirmed via deep research: a real, well-established (Baseline
    // since July 2020) technique - real precedent EdCoyle.dev,
    // ag-portfolio. 574px = half of .page-sheet's 1148px max-width; only
    // holds because .page-sheet is centered via margin:0 auto.
    // Self-collapses to the original flat 1rem at/below ~1148px+2rem, so
    // no separate mobile override is needed (unlike the theme toggle,
    // which moved fully in-flow instead, since it doesn't need
    // scroll-reachability the way this button does).
    const style = readAllPageCss(html);
    expect(style).toMatch(
      /\.scroll-to-top(\[[^\]]*\])?\s*\{[^}]*right:\s*max\(1rem,\s*calc\(50vw\s*-\s*574px\s*\+\s*1rem\)\)/,
    );
  });

  it("(regression) ships j/k next/previous-story keyboard navigation and a t jump-to-top key, scoped to real visible story links only", () => {
    // Mature, well-established reading-list convention (Gmail, Google
    // Reader, Reeder, Feedly, HN power-user extensions). This project's
    // Vitest suite is entirely node-environment (no jsdom/happy-dom
    // dependency exists, matching the "no new dependency for small
    // conveniences" pattern already established here) so a real
    // simulated-keydown test isn't feasible without adding one - this
    // asserts the shipped script contains the real logic instead,
    // matching this file's existing pattern for other client-only
    // behavior (e.g. the scroll-to-top gate above).
    expect(html).toMatch(
      /querySelectorAll[^;]*\.story-list \.story-card:not\(\[hidden\]\) \.story-title/,
    );
    expect(html).toMatch(/key\s*===\s*["']j["']/);
    expect(html).toMatch(/key\s*===\s*["']k["']/);
    expect(html).toMatch(/key\s*===\s*["']t["']/);
    // Must never hijack real typing in an editable field.
    expect(html).toMatch(/isContentEditable/);
  });
});

describe("dist/favicon.svg", () => {
  it("(backlog) is the new sunrise-glyph mark, not the old 'dd' monogram", () => {
    const svgPath = join(DIST_DIR, "favicon.svg");
    expect(existsSync(svgPath), `expected ${svgPath} to exist`).toBe(true);
    const svg = readFileSync(svgPath, "utf-8");
    expect(svg).not.toContain(">dd<");
    expect(svg).toContain('r="7"');
  });

  it("(regression) uses only static inline fills, never a <style>/@media block - Chromium's favicon-specific SVG rasterizer (a separate, more restrictive parser than the one used for a regular <img>/page render) doesn't reliably support either, and silently falls back to an auto-generated 'dd' monogram tab icon when it can't rasterize the declared favicon - the exact symptom this file's sibling test above already guards against by a different route", () => {
    const svgPath = join(DIST_DIR, "favicon.svg");
    const svg = readFileSync(svgPath, "utf-8");
    expect(svg).not.toContain("<style>");
    expect(svg).not.toMatch(/@media/);
    expect(svg).toMatch(/fill="#[0-9a-fA-F]{6}"/);
  });
});
