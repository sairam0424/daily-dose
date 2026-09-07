import type { APIContext } from "astro";

// Dynamic, not a static public/robots.txt file - matches this project's
// existing rss.xml.ts/latest.json.ts convention of deriving absolute URLs
// from astro.config.mjs's `site` value at request/build time, rather than
// hardcoding the domain a second time here.
export function GET(context: APIContext) {
  if (!context.site) {
    // Fail loudly rather than silently emitting a Sitemap: line with no
    // domain - matches this project's "no silent degrade" posture (see
    // rss.xml.ts).
    throw new Error(
      "[robots.txt] Astro `site` is not configured in astro.config.mjs.",
    );
  }

  // @astrojs/sitemap always emits an index file (sitemap-index.xml),
  // never a flat sitemap.xml - confirmed against this project's own real
  // build output (dist/client/sitemap-index.xml + sitemap-0.xml).
  const sitemapUrl = new URL("sitemap-index.xml", context.site);

  const body = `User-agent: *
Allow: /

# Methodology is deliberately excluded from crawling here, matching its
# existing exclusion from the sitemap and every nav/footer (see
# astro.config.mjs's sitemap filter) - it's a real, working page, just not
# meant to be a discovery entry point. This is NOT a security boundary:
# Disallow is publicly readable and voluntary, and only affects crawling,
# not indexing via an external backlink.
Disallow: /methodology

# /stats is deliberately NOT listed here - it's already protected by real
# HTTP Basic Auth (src/middleware.ts), so a Disallow entry would only
# broadcast its existence with zero added protection.

Sitemap: ${sitemapUrl.href}
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
