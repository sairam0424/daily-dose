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
 * Escapes the five characters that matter for keeping a value from being
 * interpreted as markup rather than text, or from breaking out of either
 * a double- or single-quoted attribute (&, <, >, ", ') — not a full
 * HTML-entity library, since this only ever needs to keep an untrusted
 * value textually inert inside markup this codebase already controls.
 * Safe for both text-node and attribute-value contexts (this codebase's
 * two current callers only use it in text nodes and double-quoted
 * attributes today, but the single-quote escape is included so reuse in
 * a single-quoted attribute stays safe too, rather than silently unsafe).
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
