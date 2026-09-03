# daily-dose

`daily-dose` is a daily AI-curated technical digest that pulls from Hacker
News, arXiv, GitHub, and Dev.to. Each day it fetches a fresh batch of
stories, scores them for genuine technical interest, and renders them as a
small static site with a chart of the day's scores.

It is one of three independent sibling projects under the
[Not-Humans-Lab](../Not-Humans-Lab/) umbrella (alongside `nh-deck` and
`nh-skills`), but it stands on its own as a regular static-site content
project — no shared build, no shared dependencies.

## How it works

- **Pipeline** (`scripts/pipeline.ts`, run via `tsx`): fetches live data from
  Hacker News, arXiv, GitHub, and Dev.to's free, keyless public APIs, scores
  each item, and writes one validated file per item into a dated
  `src/data/digest/YYYY-MM-DD/` folder.
- **Site** (Astro, static output): reads those JSON files via an Astro
  Content Collections glob loader, validated against the same Zod schema
  (`src/lib/digestSchema.ts`) the pipeline writes against — one schema, two
  enforcement points, zero drift.
- **Chart**: a single Chart.js island renders a bar chart of the day's
  interest scores.
- **Archive**: `/archive/` lists every past day; `/archive/{date}/` renders
  one static page per date with older/newer navigation.
- **RSS**: `/rss.xml` emits one real `<item>` per day, linking to that day's
  archive page — subscribe instead of checking daily. Per-source feeds
  (`/rss/hn.xml`, `/rss/arxiv.xml`, `/rss/github.xml`, `/rss/devto.xml`) are
  also available if you only want one source.
- **Methodology**: `/methodology` documents the real scoring rubric,
  interest tiers, and cost controls this project actually runs.

## Running it locally

```bash
git clone <this-repo-url> daily-dose
cd daily-dose
npm install

# Fetch a fresh, real digest from Hacker News, arXiv, GitHub, and Dev.to
npm run pipeline

# View it locally
npm run dev

# Produce a static build
npm run build
```

Run `npx vitest run` to run the network-free unit/schema tests.

## Current status

This is a working project. As of this writing, every item on the original
build-out roadmap has shipped:

- **Real AI curation is live**, via a real, paid LLM API call (model
  fallback chain: Claude Sonnet 5 → Sonnet 4.6 → Opus 4.6 → Haiku 4.5,
  Sonnet 5 leading as of ADR 0005). Every fetched item (HN + arXiv + GitHub
  + Dev.to) is scored in one batched call per pipeline run. The original
  deterministic placeholder heuristic (derived from real, already-fetched
  fields — points/comment count/title for HN, recency for arXiv,
  stars/forks for GitHub, reactions/comments for Dev.to) is kept as an
  explicit, loudly-logged fallback for local dev without credentials, or
  for any individual item the model's response happens to omit — it is
  never silently substituted. See `decisions.md`'s ADR 0003 for the full
  design.
- **Four sources ship for real: Hacker News, arXiv, GitHub, and Dev.to.**
  The pipeline runs all four by default (`--sources hn,arxiv,github,devto`)
  — see `decisions.md`'s ADR 0006 for why GitHub surfaces recently-created,
  fast-rising repos rather than a curated watchlist or a scrape of
  github.com/trending, and ADR 0007 for why Dev.to surfaces today's "hot
  right now" articles (with a real, bounded body-text excerpt) rather than
  Reddit, Lobste.rs, or Product Hunt.
- **The daily pipeline now runs automatically.** A dedicated workflow
  (`.github/workflows/daily-pipeline.yml`) runs `npm run pipeline` once a
  day (21:00 UTC) via a real `schedule:` trigger, and commits the result
  itself — see `decisions.md`'s ADR 0004. `.github/workflows/ci.yml` is
  unchanged and still only runs on manual `workflow_dispatch` plus
  push/PR.
- **The site is live.** Visit https://daily-dose-hazel-delta.vercel.app —
  git-integrated auto-deploy on push to `main` (ADR 0004), Build Command
  confirmed as `npm run build` only, so Vercel never runs the pipeline or
  sees any LLM credentials.
- **A public cost/stats page ships.** Visit `/stats` for real per-run LLM
  cost, broken down by model and by day, read directly from
  `src/data/stats.jsonl`.
- **A digest archive and RSS feed ship.** Visit `/archive/` to browse every
  past day, or subscribe at `/rss.xml` (or a per-source feed) instead of
  checking the site daily — see `decisions.md`'s 2026-09-03 log entry.
- **A methodology page ships.** Visit `/methodology` for the real scoring
  rubric, cost thresholds, and pricing this project actually runs.

## License

Apache-2.0
