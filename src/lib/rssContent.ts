import type { DigestItem } from "./digestSchema.js";
import { escapeHtml } from "./htmlEscape.js";

/**
 * Pure, framework-agnostic RSS content rendering — deliberately NOT in
 * src/pages/rss.xml.ts and deliberately NOT importing astro:content. That
 * virtual module only resolves inside Astro's own dev/build context, so a
 * module that imports it can never be unit-tested directly from plain
 * Vitest (confirmed the hard way - see agent_learning.md). Operating on
 * plain DigestItem values instead keeps this file real-Vitest-testable.
 */

// The hand-written structural tags below (<li>/<strong>/<a href>/<p>) stay
// RAW, not pre-escaped: @astrojs/rss's rss() entity-escapes the entire
// composed `content` string exactly once when serializing the
// <content:encoded> element - confirmed directly against the installed
// version, not assumed. A real RSS reader recovers real HTML from that
// field by XML-unescaping it exactly once, so our structural tags need to
// survive exactly one escape (by rss()) + one unescape (by the reader) to
// come out as real markup.
//
// The untrusted field values (title/why_read/source) are different: they
// must NOT become live markup even after that same one-unescape round
// trip a reader performs. Escaping them here, before they ever reach
// rss()'s own escape pass, means they go through TWO escapes total (this
// file's, then rss()'s) against the reader's ONE unescape - net result,
// they still read back as escaped, inert text (e.g. "&lt;script&gt;", not
// a live <script> tag) even after a compliant reader's normal XML
// unescaping. This closes a real script-tag-breakout gap a title like
// `</script>` (or any HTML) could otherwise open once decoded by a reader
// that renders content:encoded as HTML - see docs/superpowers/plans/
// 2026-09-10-research-sweep-fixes.md item 1d. It also means a literal "&"
// in a real title (e.g. "React & Redux") now shows up double-escaped
// ("&amp;amp;") in the raw built XML - a visible but correct and safe
// trade-off, not a bug: after the reader's one real unescape it reads back
// as a single "&amp;", not a live ampersand misinterpreted as an entity
// start.
//
// One real <li> per story: title, interest score, source, and the actual
// why_read text pulled from the committed digest data — never a fabricated
// summary, matching SOUL.md's honesty rules for anything a reader sees.
function renderStoryListItem(item: DigestItem): string {
  const { title, url, interest_score, source, why_read } = item;
  return (
    `<li>` +
    `<strong><a href="${url}">${escapeHtml(title)}</a></strong> ` +
    `(score: ${interest_score.toFixed(1)}, source: ${escapeHtml(source)})` +
    `<p>${escapeHtml(why_read)}</p>` +
    `</li>`
  );
}

export function renderDayContent(items: DigestItem[]): string {
  return `<ul>${items.map(renderStoryListItem).join("")}</ul>`;
}
