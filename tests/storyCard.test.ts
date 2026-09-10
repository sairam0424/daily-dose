import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../src/components/StoryCard.astro", import.meta.url),
  "utf-8",
);

describe("StoryCard.astro source structure", () => {
  it("renders the analysis paragraph conditionally, between the title and the badge row", () => {
    const titleEnd = source.indexOf("</a>");
    const analysisLine = source.indexOf('<p class="story-analysis">');
    const metaStart = source.indexOf('<div class="story-meta">');

    expect(titleEnd).toBeGreaterThan(-1);
    expect(analysisLine).toBeGreaterThan(-1);
    expect(metaStart).toBeGreaterThan(-1);
    expect(analysisLine).toBeGreaterThan(titleEnd);
    expect(analysisLine).toBeLessThan(metaStart);
  });

  it("defines a .story-analysis style rule using the shared body-text tokens", () => {
    expect(source).toMatch(
      /\.story-analysis\s*\{[^}]*font-family:\s*var\(--font-body\)[^}]*color:\s*var\(--ink-soft\)/s,
    );
  });

  it("defines a larger .story-analysis size override for the lead story", () => {
    expect(source).toMatch(/\.lead-story \.story-analysis\s*\{[^}]*font-size:/);
  });

  it("(regression) removes the favicon icon on load failure instead of showing a broken-image icon", () => {
    // Real, observed failure: a real item's favicon_url (a third-party
    // site's own favicon path) started returning HTTP 403 sometime after
    // the pipeline's own reachability check passed - an inherent risk of
    // any resolved third-party URL, not something a pipeline-side fix
    // can guarantee against. Client-side onerror is the robust fallback.
    expect(source).toMatch(
      /<img[^>]*class="favicon-icon"[^>]*onerror="this\.remove\(\)"/s,
    );
  });

  it("(regression) removes the story image AND its card's has-image class on load failure, instead of showing an empty styled box", () => {
    // Real, observed failure: a real item's image_url (e.g. GitHub's
    // opengraph.githubassets.com card image) started failing to load
    // sometime after the pipeline's own reachability check passed - the
    // exact same class of "verified reachable at write time, broke later"
    // risk the favicon_url case above already documents. .story-image's
    // own CSS (width:100%, aspect-ratio, a real background) styles the
    // <img> element directly, so a plain onerror="this.remove()" alone
    // isn't enough here - the parent .story-card also needs its
    // has-image class removed, or it stays a wider 3-column card (see
    // the @container story-list grid rule) with nothing in the slot.
    expect(source).toMatch(
      /<img[^>]*class="story-image"[^>]*onerror="this\.closest\('\.story-card'\)\?\.classList\.remove\('has-image'\); this\.remove\(\);"/s,
    );
  });

  it("(regression) sends no referrer on hotlinked third-party images/favicons", () => {
    // Confirmed via /deep-research: the browser's default referrer
    // policy already limits what leaks to daily-dose's bare origin
    // (not which specific digest item was viewed), but that's still a
    // real, unmitigated gap against this project's own privacy policy's
    // minimal-third-party-exposure stance. referrerpolicy="no-referrer"
    // closes it completely, with zero infrastructure.
    expect(source).toMatch(
      /<img[^>]*class="story-image"[^>]*referrerpolicy="no-referrer"/s,
    );
    expect(source).toMatch(
      /<img[^>]*class="favicon-icon"[^>]*referrerpolicy="no-referrer"/s,
    );
  });

  it("renders a SourceIcon before the source text inside the source badge, not in place of it", () => {
    expect(source).toContain("import SourceIcon from './SourceIcon.astro';");

    const badgeLine = source.indexOf(
      "class={`source-badge source-badge-${entry.data.source}`}",
    );
    expect(badgeLine, "expected the source-badge span").toBeGreaterThan(-1);

    const iconIndex = source.indexOf("<SourceIcon", badgeLine);
    const textIndex = source.indexOf("{entry.data.source}</span>", badgeLine);
    expect(
      iconIndex,
      "expected a <SourceIcon /> inside the badge",
    ).toBeGreaterThan(badgeLine);
    expect(
      textIndex,
      "expected the existing {entry.data.source} text to still be rendered",
    ).toBeGreaterThan(badgeLine);
    expect(
      iconIndex,
      "expected the icon to render before the text, not after/replacing it",
    ).toBeLessThan(textIndex);
  });

  it("(regression) lets a newspaper story card flow across a column break instead of forcing a whole-card jump", () => {
    // Confirmed via Playwright getBoundingClientRect on a real archive
    // page: break-inside:avoid forces a card that doesn't fit the
    // remaining space in a column to jump to the next column instead of
    // splitting, which compounds into badly unbalanced columns with real
    // content of uneven card heights (one column measured ~460px shorter
    // than the tallest, with a dead gap below it). break-inside:auto
    // balanced the same real content to within ~275px with no card
    // actually rendering split.
    expect(source).toMatch(
      /\[data-skin=['"]?newspaper['"]?\]\)\s*\.story-card\s*\{[^}]*break-inside:\s*auto/s,
    );
  });

  it("(regression) renders a visible tier-badge in the meta row so a reader can identify a card's tier without using the filter bar", () => {
    expect(source).toContain("class={`tier-badge tier-badge-${tier}`}");
    expect(source).toMatch(
      /\.tier-badge-must-read\s*\{[^}]*border-color:\s*var\(--accent\)/s,
    );
    expect(source).toMatch(
      /\.tier-badge-recommended\s*\{[^}]*border-color:\s*var\(--rule\)/s,
    );
  });

  it("(regression) discloses AI authorship inline, right next to the analysis text itself, not only in the footer/meta/methodology page", () => {
    // Confirmed via /deep-research: footer-only/meta-only disclosure is
    // explicitly called inadequate by multiple 2026 sources - the
    // converging pattern is a small, persistent, inline label placed AT
    // the AI-generated content itself, same visual weight as a byline.
    const analysisMatch = source.match(
      /<p class="story-analysis">([\s\S]*?)<\/p>/,
    );
    expect(
      analysisMatch,
      "expected the .story-analysis paragraph",
    ).toBeTruthy();
    expect(analysisMatch![1]).toContain('class="ai-badge"');
    expect(analysisMatch![1]).toContain("AI-analyzed");
  });

  it("(seo fix) wraps the story title link in a real heading element for per-item topical structure", () => {
    expect(source).toMatch(
      /<h3 class="story-title-heading">\s*<a class="story-title"/s,
    );
  });

  it("(seo fix) gives each story card a stable id-based permalink anchor using the item's own id", () => {
    expect(source).toMatch(/<li\s+id=\{entry\.id\}/s);
  });

  it("(seo fix) neutralizes the heading wrapper's default browser styling so it stays visually identical", () => {
    expect(source).toMatch(
      /\.story-title-heading\s*\{[^}]*margin:\s*0[^}]*font-size:\s*inherit[^}]*font-weight:\s*inherit[^}]*line-height:\s*inherit/s,
    );
  });

  it("(accessibility fix) keeps the story thumbnail decorative (empty alt) since it sits adjacent to the identical h3/link title text", () => {
    // Regression: an earlier version of this fix set alt={entry.data.title},
    // which made a screen reader announce the same title twice per card
    // (once as the image's alt text, once as the h3/link text right next
    // to it) - WCAG guidance is that an image adjacent to identical text
    // should stay decorative, not carry a duplicate accessible name.
    expect(source).toMatch(/<img\s+class="story-image"[^>]*alt=""/s);
  });

  it("(regression) keeps the small favicon icon correctly decorative (empty alt)", () => {
    expect(source).toMatch(/<img\s+class="favicon-icon"[^>]*alt=""/s);
  });

  it("(seo fix) grows the why-icon button's real hit area toward the mobile touch-target guideline", () => {
    expect(source).toMatch(/\.why-icon\s*\{[^}]*padding:\s*0\.5rem/s);
  });

  it("(perf fix) loads the lead story's hero image eagerly at high priority, keeping every other card lazy", () => {
    // The lead story (index === 0) is this page's LCP element - an
    // unconditional loading="lazy" delays the browser from even
    // discovering it until layout, adding avoidable time to LCP.
    // Every other card should stay lazy, unchanged.
    const imageMatch = source.match(/<img\s+class="story-image"[^>]*\/>/s);
    expect(imageMatch, "expected the story-image <img> tag").toBeTruthy();
    const imageTag = imageMatch![0];

    expect(imageTag).toContain("loading={index === 0 ? 'eager' : 'lazy'}");
    expect(imageTag).toContain(
      "fetchpriority={index === 0 ? 'high' : undefined}",
    );
  });

  it("(perf fix) leaves the decorative favicon icon's loading behavior untouched (still unconditionally lazy)", () => {
    expect(source).toMatch(/<img\s+class="favicon-icon"[^>]*loading="lazy"/s);
  });

  it("(regression) excludes GitHub lead stories from the Newspaper skin's headline drop-cap", () => {
    // Real, screenshot-confirmed bug: a GitHub item's title is always an
    // owner/repo code identifier (e.g. "openai/NavierStokesAndEuler"),
    // never prose - pulling its first character into a 3em floated
    // drop-cap produced a nonsensical oversized standalone letter glued
    // to the rest of the identifier with no natural word break.
    expect(source).toMatch(
      /\.lead-story:not\(\[data-source=['"]github['"]\]\)\s*\.story-title::first-letter/,
    );
  });

  it("(regression) sets height:auto on the story image so aspect-ratio governs its box instead of the width/height HTML attributes", () => {
    // Real, live-confirmed bug: the <img>'s width="560" height="315"
    // attributes (kept for CLS prevention) map to a fixed-pixel CSS
    // height presentational hint, which counts as an explicit height and
    // so wins over aspect-ratio's own auto-sizing - every homepage story
    // image rendered as a squashed fixed-height box (e.g. 1037x315
    // instead of a real 16:9/16:8 box) regardless of its actual rendered
    // width. height: auto restores aspect-ratio as the real source of
    // truth.
    expect(source).toMatch(
      /\.story-image\s*\{[^}]*width:\s*100%;[^}]*height:\s*auto;[^}]*aspect-ratio:\s*16 \/ 9;/s,
    );
  });

  it("(regression) caps the lead story's hero image height so the headline stays visible on first view", () => {
    // Real user report: the lead card spans up to 4 grid columns, so at
    // typical desktop widths this image's aspect-ratio-computed height
    // alone was 500px+, pushing the headline/analysis text below the
    // fold. object-fit:contain (already set on the base .story-image
    // rule) letterboxes into this shorter box using the existing
    // --bg-surface background, so this cap doesn't crop or distort the
    // image.
    expect(source).toMatch(
      /\.lead-story \.story-image\s*\{[^}]*max-height:\s*280px;/s,
    );
  });
});
