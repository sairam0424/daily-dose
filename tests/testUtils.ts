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
