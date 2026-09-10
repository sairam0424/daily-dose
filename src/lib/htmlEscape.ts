/**
 * src/lib/htmlEscape.ts
 *
 * Shared HTML-entity-escape helper for untrusted string values (item
 * titles, why_read text, source labels) that get interpolated into
 * hand-written markup elsewhere in this codebase — src/lib/rssContent.ts's
 * RSS <content:encoded> rendering and src/lib/llmCuration.ts's <title>
 * prompt tag. Extracted here, rather than duplicated in both files, so the
 * one escaping rule stays in one place.
 *
 * Escapes only the four characters that matter for keeping a value from
 * being interpreted as markup rather than text (&, <, >, ") — not a full
 * HTML-entity library, since this only ever needs to keep an untrusted
 * value textually inert inside markup this codebase already controls.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
