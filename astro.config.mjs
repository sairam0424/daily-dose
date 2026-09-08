import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';

export default defineConfig({
  output: 'static',
  adapter: vercel(),
  site: 'https://daily-dose-hazel-delta.vercel.app',
  integrations: [
    sitemap({
      // Methodology is deliberately delisted from every nav/footer (PR #79)
      // so a third-party reader never stumbles into second-guessing the
      // curation rubric instead of just reading the digest - excluding it
      // from the sitemap too keeps search engines from surfacing it as an
      // entry point either. The page itself still exists and works if
      // linked directly.
      //
      // /stats is excluded for a different reason: it's real HTTP Basic
      // Auth-gated (401 for any unauthenticated crawler) - robots.txt
      // already documents this same reasoning for omitting it from
      // Disallow. Publishing it in the sitemap would tell crawlers it's a
      // real, readable URL when it structurally can never return content
      // to them, wasting crawl budget and surfacing as a spurious
      // "blocked due to unauthorized request" error in Search Console.
      filter: (page) => !page.includes('/methodology') && !page.includes('/stats'),
      // Real per-page freshness signal instead of no <lastmod> at all - an
      // /archive/{date}/ URL's own date IS its real last-content-change
      // date (each digest date's files are written once and never
      // touched again), so this reads it straight off the URL rather
      // than fabricating one. Every other page falls back to the build
      // timestamp.
      serialize(item) {
        const dateMatch = item.url.match(/\/archive\/(\d{4}-\d{2}-\d{2})\/?$/);
        return {
          ...item,
          lastmod: dateMatch ? new Date(dateMatch[1]) : new Date(),
        };
      },
    }),
  ],
});
