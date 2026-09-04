import type { DigestItem } from "./digestSchema.js";

/**
 * Pure, framework-agnostic RSS content rendering — deliberately NOT in
 * src/pages/rss.xml.ts and deliberately NOT importing astro:content. That
 * virtual module only resolves inside Astro's own dev/build context, so a
 * module that imports it can never be unit-tested directly from plain
 * Vitest (confirmed the hard way - see agent_learning.md). Operating on
 * plain DigestItem values instead keeps this file real-Vitest-testable.
 */

// Field values are interpolated RAW here, not pre-escaped: @astrojs/rss's
// rss() entity-escapes the entire composed `content` string (including our
// own literal <li>/<strong>/<p> tags) exactly once when serializing the
// <content:encoded> element - confirmed directly against the installed
// version, not assumed. Pre-escaping here as well would double-escape any
// real title/why_read containing a literal &, <, or > (e.g. "&amp;amp;"
// instead of "&amp;"), which is invisible with the current tiny dataset
// but a real, live bug the moment a title like "React & Redux" appears.
//
// One real <li> per story: title, interest score, source, and the actual
// why_read text pulled from the committed digest data — never a fabricated
// summary, matching SOUL.md's honesty rules for anything a reader sees.
function renderStoryListItem(item: DigestItem): string {
  const { title, url, interest_score, source, why_read } = item;
  return (
    `<li>` +
    `<strong><a href="${url}">${title}</a></strong> ` +
    `(score: ${interest_score.toFixed(1)}, source: ${source})` +
    `<p>${why_read}</p>` +
    `</li>`
  );
}

export function renderDayContent(items: DigestItem[]): string {
  return `<ul>${items.map(renderStoryListItem).join("")}</ul>`;
}
