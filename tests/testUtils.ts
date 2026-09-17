import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The @astrojs/vercel adapter (Phase 5, feat(stats): switch /stats to
// on-demand rendering) splits `astro build`'s output into `dist/client/`
// (static assets) and `dist/server/` (the on-demand render function) —
// every e2e test that reads pre-built static HTML/XML/JSON must read from
// `dist/client/`, not the old flat `dist/` root.
export const DIST_DIR = join(import.meta.dirname, "..", "dist", "client");

// Astro's default `build.inlineStylesheets: 'auto'` only inlines a page's
// CSS as a <style> tag while it stays under Vite's ~4096-byte threshold;
// past that it writes the same CSS to an external /_astro/*.css file and
// links it instead. Which bucket a given rule lands in is a build-tool
// implementation detail, not something a CSS-only assertion should have
// to control — so this helper concatenates inline <style> content with
// the content of any local stylesheet <link> targets, giving one
// haystack of "all CSS that actually ships with this page" to assert
// against regardless of where the bundler decided to put it.
export function readAllPageCss(pageHtml: string): string {
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

// Astro's default text-node rendering HTML-entity-escapes all 5 XML-
// significant characters (&<>"'), not just the 3 strictly required in a
// text node — real, confirmed via a live title containing an apostrophe
// ("driver's license") rendering as "driver&#39;s license" in dist
// output. Any test comparing a raw digest-item string field (title,
// why_read) against rendered HTML must decode entities first, or it
// silently only ever passes for titles with no HTML-significant
// characters — which happened to be every title ever committed, until
// one real HN story finally had an apostrophe.
const ENTITY_DECODE: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

export function decodeHtmlEntities(html: string): string {
  return html.replace(
    /&amp;|&lt;|&gt;|&quot;|&#39;|&apos;/g,
    (entity) => ENTITY_DECODE[entity]!,
  );
}
