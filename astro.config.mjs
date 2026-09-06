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
      filter: (page) => !page.includes('/methodology'),
    }),
  ],
});
