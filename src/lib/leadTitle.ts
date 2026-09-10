// Pure lead-title formatting logic extracted from archive/[date].astro so
// it stays directly Vitest-testable, mirroring this repo's existing
// convention (see digestGrouping.ts/readingTime.ts/rssContent.ts) of
// keeping logic an Astro page depends on in src/lib rather than only
// inside the page's own frontmatter script, without needing Astro's
// heavier Container API test setup (see tests/content-collection.test.ts's
// own rationale for avoiding it).

// Real per-date lead-story title data is unbounded free text from HN/
// arXiv/GitHub/Dev.to and can end in its own terminal punctuation ("?"/
// "!") or run long enough to blow past a rendering context's length
// budget (see Task 9's own rationale in
// docs/superpowers/plans/2026-09-10-seo-fixes.md). Stripping any trailing
// terminal punctuation before re-adding the closing "." avoids double
// punctuation like `..."?."`; truncating with an ellipsis (and no added
// period, since a truncated phrase already reads as unfinished) keeps the
// total length bounded regardless of the real title's length.
export const MAX_LEAD_TITLE_CHARS = 48;

/** Quote (and, if it exceeds MAX_LEAD_TITLE_CHARS, truncate) a real
 * lead-story title for display. */
export function quoteLeadTitle(title: string): string {
  const stripped = title.replace(/[.?!]+$/, "");
  // Array.from() iterates a string by Unicode code point, not UTF-16 code
  // unit - a plain String.prototype.slice() on a title containing an
  // astral-plane character (e.g. an emoji outside the Basic Multilingual
  // Plane, encoded as a UTF-16 surrogate pair) can cut between the two
  // halves of that pair, producing a lone/unpaired surrogate in the
  // result. That's a real correctness bug, not just cosmetic: a lone
  // surrogate makes encodeURIComponent throw a URIError, and round-trips
  // through UTF-8 (de)serialization as the U+FFFD replacement character
  // instead of the original glyph. Slicing an array of code points
  // instead guarantees truncation only ever lands on a whole-character
  // boundary.
  const codePoints = Array.from(stripped);
  if (codePoints.length > MAX_LEAD_TITLE_CHARS) {
    return `"${codePoints.slice(0, MAX_LEAD_TITLE_CHARS).join("").trimEnd()}…"`;
  }
  return `"${stripped}."`;
}
