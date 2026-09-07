import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../src/components/StoryCard.astro", import.meta.url),
  "utf-8",
);

describe("StoryCard.astro source structure", () => {
  it("renders the analysis paragraph conditionally, between the title and the badge row", () => {
    const titleEnd = source.indexOf("</a>");
    const analysisLine = source.indexOf(
      '{entry.data.analysis && <p class="story-analysis">{entry.data.analysis}</p>}',
    );
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
});
