import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  output: 'static',
  site: 'https://daily-dose-hazel-delta.vercel.app',
  integrations: [sitemap()],
});
