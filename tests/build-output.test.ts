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

const DIST_DIR = join(import.meta.dirname, "..", "dist");
const DIST_INDEX = join(DIST_DIR, "index.html");
const DIGEST_BASE = join(import.meta.dirname, "..", "src", "data", "digest");

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

// Astro's default `build.inlineStylesheets: 'auto'` only inlines a page's
// CSS as a <style> tag while it stays under Vite's ~4096-byte threshold;
// past that it writes the same CSS to an external /_astro/*.css file and
// links it instead. Which bucket a given rule lands in is a build-tool
// implementation detail, not something a CSS-only task should have to
// control — so this helper concatenates inline <style> content with the
// content of any local stylesheet <link> targets, giving one haystack of
// "all CSS that actually ships with this page" to assert against
// regardless of where the bundler decided to put it.
function readAllPageCss(pageHtml: string): string {
  const inlineStyles = [
    ...pageHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g),
  ]
    .map((match) => match[1])
    .join("\n");

  const externalCss = [
    ...pageHtml.matchAll(/<link\s+[^>]*rel="stylesheet"[^>]*>/gi),
  ]
    .map((linkTag) => linkTag[0].match(/href="([^"]+)"/i)?.[1])
    .filter(
      (href): href is string =>
        typeof href === "string" && href.startsWith("/"),
    )
    .map((href) => join(DIST_DIR, href))
    .filter((cssPath) => existsSync(cssPath))
    .map((cssPath) => readFileSync(cssPath, "utf-8"))
    .join("\n");

  return `${inlineStyles}\n${externalCss}`;
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
    expect(html.includes('id="score-chart"')).toBe(true);

    // A correctly bundled DigestChart <script> is minified and compiled
    // into an external, hashed /_astro/*.js chunk alongside chart.js - the
    // literal source text "chart.js" and "new Chart(" do NOT survive that
    // process (minification renames the "Chart" identifier), so asserting
    // on those substrings against index.html is not meaningful evidence
    // either way. Instead, resolve the actual chunk Astro linked and
    // confirm it both exists on disk and contains our component's real
    // canvas target - proof the chart-mounting code was bundled in, not
    // just referenced by a tag pointing at nothing.
    const scriptSrcMatch = html.match(
      /<script[^>]*type="module"[^>]*src="([^"]*DigestChart[^"]*)"/,
    );
    expect(
      scriptSrcMatch,
      'expected a bundled <script type="module" src="...DigestChart..."> tag',
    ).toBeTruthy();

    const chunkPath = join(DIST_DIR, scriptSrcMatch![1]);
    expect(
      existsSync(chunkPath),
      `expected the linked chunk to exist at ${chunkPath}`,
    ).toBe(true);
    expect(readFileSync(chunkPath, "utf-8")).toContain("score-chart");
  });

  it("(regression) bundles DigestChart's script instead of shipping the raw unresolved import", () => {
    // The checks above are too weak to catch this: the substrings
    // "chart.js" and "new Chart(" are both still present in the RAW,
    // UNBUNDLED source text of `import Chart from 'chart.js/auto';` and
    // `const chart = new Chart(canvas, {...})`, so they pass even when
    // Astro fails to bundle the component's <script> and ships the bare
    // module specifier verbatim - which no browser can resolve ("Failed to
    // resolve module specifier \"chart.js/auto\""), leaving the chart
    // canvas completely blank. A properly bundled build never contains this
    // literal import statement in the HTML at all - Vite either inlines the
    // resolved code or emits a hashed external <script src="/_astro/...">.
    expect(html).not.toContain("import Chart from 'chart.js/auto'");
    expect(html).not.toContain("chart.js/auto");
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

  it("tags every story card with its source and interest tier", () => {
    expect(html.includes("data-source=")).toBe(true);
    expect(html.includes("data-interest-tier=")).toBe(true);
  });

  it("includes the static empty-state markup for when filters match no stories", () => {
    expect(html.includes('id="filter-empty-state"')).toBe(true);
    expect(html.includes("No stories match the selected filters.")).toBe(true);
  });

  it("has a Methodology nav link", () => {
    expect(html).toContain('href="/methodology"');
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

  it("renders the skin segmented control defaulting to Dev-editorial with the theme toggle disabled", () => {
    expect(html).toMatch(/id="skin-toggle-dev"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/id="skin-toggle-newspaper"[^>]*aria-pressed="false"/);
    expect(html).toMatch(/id="theme-toggle"[^>]*disabled/);
  });

  it("keeps the score chart canvas present after the redesign (regression check)", () => {
    expect(html).toContain('id="score-chart"');
    expect(html).not.toContain("rgba(79, 70, 229"); // old hardcoded indigo
  });

  it("(audit fix) wraps the header nav on narrow viewports so it never renders under the fixed preference-controls", () => {
    // Regression test for a real bug found during a post-redesign E2E
    // audit: the mobile-nav-vs-preference-controls fix shipped earlier
    // was only verified against 2-link navs (archive pages); the
    // homepage's 3-link nav fit within its container without needing to
    // wrap, so flex-wrap alone never triggered - it just rendered
    // underneath the fixed-position controls layered on top at 375px,
    // confirmed via live getBoundingClientRect overlap. The fix reserves
    // horizontal space via padding-right so a 3rd link is forced onto a
    // new row instead of sitting under the fixed overlay.
    const style = readAllPageCss(html);
    const mobileNavRule =
      /@media\s*\(max-width:\s*480px\)\s*\{[^}]*\.site-nav\s*\{[^}]*flex-wrap:\s*wrap[^}]*padding-right:[^}]*\}/;
    expect(
      style,
      "expected a @media(max-width:480px) .site-nav rule with flex-wrap:wrap and a padding-right reservation",
    ).toMatch(mobileNavRule);
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

    const leadMatch = html.match(
      /<li class="story-card lead-story"[^>]*>[\s\S]*?<\/li>/,
    );
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
});
