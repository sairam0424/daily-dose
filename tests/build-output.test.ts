// PRECONDITION: this is an e2e-style test that only READS already-built
// output — it never invokes the build itself. It assumes `npm run build`
// (i.e. `astro build`) has already run before this suite executes, matching
// this project's real CI step order: install, then build, then test. If you
// are running this locally, run `npm run build` first.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { DigestItemSchema } from "../src/lib/digestSchema.js";

const DIST_DIR = join(import.meta.dirname, "..", "dist");
const DIST_INDEX = join(DIST_DIR, "index.html");
const DIGEST_BASE = join(import.meta.dirname, "..", "src", "data", "digest");

function findJsonFiles(base: string): string[] {
  return readdirSync(base, { recursive: true })
    .filter((entry) => typeof entry === "string" && entry.endsWith(".json"))
    .map((entry) => join(base, entry as string));
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
    const hasChartCanvas = html.includes('id="score-chart"');
    const hasChartJsReference =
      html.includes("chart.js") || html.includes("new Chart(");
    expect(hasChartCanvas).toBe(true);
    expect(hasChartJsReference).toBe(true);
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
    const hnFile = findJsonFiles(DIGEST_BASE).find((filePath) =>
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

  it("renders a real Discussion/Repo/Paper reading-time badge per source (no fabricated arXiv time on today's pre-existing committed data)", () => {
    // Today's real committed arXiv items predate this feature and have no
    // reading_minutes set yet - they must show the honest "Paper" fallback,
    // not a fabricated "~X min read". This is deliberately testing the
    // CURRENT real state, not a hypothetical future state.
    expect(html).toContain(">Discussion<");
    expect(html).toContain(">Repo<");
    expect(html).toContain(">Paper<");
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

  it("marks the highest-scored story as the lead story", () => {
    const items = findJsonFiles(DIGEST_BASE).map((filePath) =>
      DigestItemSchema.parse(JSON.parse(readFileSync(filePath, "utf-8"))),
    );
    const topItem = [...items].sort(
      (a, b) => b.interest_score - a.interest_score,
    )[0];
    expect(topItem, "expected at least one committed digest item").toBeTruthy();

    const leadMatch = html.match(
      /<li class="story-card lead-story"[^>]*>[\s\S]*?<\/li>/,
    );
    expect(leadMatch, "expected a .lead-story <li>").toBeTruthy();
    expect(leadMatch![0]).toContain(topItem!.title);
  });

  it("(review fix) uses the exact why_read string as the info button's accessible label", () => {
    const items = findJsonFiles(DIGEST_BASE).map((filePath) =>
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
});
