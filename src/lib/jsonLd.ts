/**
 * src/lib/jsonLd.ts
 *
 * Every JSON-LD block on this site is rendered via Astro's `set:html`,
 * which writes the string directly into the HTML document with no
 * further escaping. Several of these schemas embed real, untrusted
 * third-party data (e.g. `entry.data.title` from HN/arXiv/GitHub/Dev.to).
 * A title containing the literal bytes "</script>" would close the
 * JSON-LD <script> tag early and let the next bytes parse as a brand
 * new, real, executable <script> element - a real script-tag-breakout
 * XSS, not a theoretical one. Escaping "<" (which JSON never needs
 * unescaped) closes this off completely while staying valid,
 * round-trippable JSON: `<` decodes back to the exact original
 * character when any JSON parser reads it.
 */
export function safeJsonLdString(schema: unknown): string {
  return JSON.stringify(schema).replace(/</g, "\\u003c");
}
