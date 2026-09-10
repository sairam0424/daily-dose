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

/** Quote (and, if it exceeds `maxChars`, truncate) a real lead-story title
 * for display. `maxChars` defaults to the looser body-copy budget
 * (MAX_LEAD_TITLE_CHARS, calibrated against the ~155-char meta-description
 * ceiling); pass a smaller value for a tighter context, e.g. a `<title>`
 * tag's own, much shorter SERP-truncation ceiling. */
export function quoteLeadTitle(
  title: string,
  maxChars: number = MAX_LEAD_TITLE_CHARS,
): string {
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
  if (codePoints.length > maxChars) {
    return `"${codePoints.slice(0, maxChars).join("").trimEnd()}…"`;
  }
  return `"${stripped}."`;
}

// A page's <title> tag has a much tighter real SERP-truncation budget
// (see tests/titleLength.test.ts's MAX_SAFE_TITLE_LENGTH, 60 chars) than
// quoteLeadTitle's own default MAX_LEAD_TITLE_CHARS body budget, which is
// calibrated against the far looser ~155-char meta-description ceiling.
// Reusing a quoteLeadTitle(title) call meant for the description verbatim
// in a <title> tag would blow past that tighter budget on every real
// digest date checked this session (the fixed
// "The Daily Dose — YYYY-MM-DD — led by " prefix alone already consumes
// well over half of it) - compute the real remaining budget for the
// quoted title instead of reusing the description's own truncation.
const TITLE_TAG_MAX_CHARS = 60;

/** Build the archive date page's <title> tag: the fixed
 * "The Daily Dose — {date} — led by {quoted lead title}" shape, with the
 * lead title truncated against whatever budget remains under
 * `maxChars` (default: the real ~60-char SERP-truncation ceiling) after
 * the fixed prefix and quoteLeadTitle's own wrapping quotes/terminal
 * punctuation (3 chars) are accounted for. */
export function buildArchiveDateTitle(
  date: string,
  leadTitle: string,
  maxChars: number = TITLE_TAG_MAX_CHARS,
): string {
  const prefix = `The Daily Dose — ${date} — led by `;
  const quotedTitleBudget = Math.max(0, maxChars - prefix.length - 3);
  return `${prefix}${quoteLeadTitle(leadTitle, quotedTitleBudget)}`;
}
