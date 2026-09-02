# daily-dose

`daily-dose` is a daily AI-curated technical digest that pulls from arXiv and
Hacker News — this is my own version of the daily-digest concept popularized
by [arpitbbhayani/the-daily-diff](https://github.com/arpitbbhayani/the-daily-diff).
Each day it fetches a fresh batch of stories, scores them for interest, and
renders them as a small static site with a chart of the day's scores.

It is one of three independent sibling projects under the
[Not-Humans-Lab](../Not-Humans-Lab/) umbrella (alongside `nh-deck` and
`nh-skills`), but it stands on its own as a regular static-site content
project — no shared build, no shared dependencies.

## How it works

- **Pipeline** (`scripts/pipeline.ts`, run via `tsx`): fetches live data from
  Hacker News' free, keyless Algolia API, scores each story, and writes one
  validated file per story into a dated `src/data/digest/YYYY-MM-DD/` folder.
- **Site** (Astro, static output): reads those JSON files via an Astro
  Content Collections glob loader, validated against the same Zod schema
  (`src/lib/digestSchema.ts`) the pipeline writes against — one schema, two
  enforcement points, zero drift.
- **Chart**: a single Chart.js island renders a bar chart of the day's
  interest scores.

## Running it locally

```bash
git clone <this-repo-url> daily-dose
cd daily-dose
npm install

# Fetch a fresh, real digest from Hacker News
npm run pipeline

# View it locally
npm run dev

# Produce a static build
npm run build
```

Run `npx vitest run` to run the network-free unit/schema tests.

## Current limitations

This is a walking skeleton, not a finished product. Specifically, as of this
writing:

- **No real LLM curation yet.** The "curation" step that assigns each
  story's `interest_score` and `why_read` text is a deterministic,
  clearly-labeled **placeholder** for both sources — derived from real,
  already-fetched Hacker News fields (points, comment count, title) for HN
  items, and from recency alone for arXiv items (capped below HN's range,
  since arXiv exposes no engagement signal) — there is no live call to
  Anthropic, OpenAI, or any other LLM API. No API keys for those services
  exist in this project's environment yet. This is the single biggest
  deferred item, and it is documented in the code, not hidden.
- **Two sources today (Hacker News + arXiv); GitHub is the remaining
  deferred fast-follow.** The pipeline runs both sources by default
  (`--sources hn,arxiv`) — the schema already models a third (`source:
  "github"`) but it hasn't been wired up yet.
- **No automated daily cron yet.** The GitHub Actions workflow
  (`.github/workflows/ci.yml`) only runs on manual `workflow_dispatch` and on
  push/PR to `main`. There is no `schedule:` trigger — turning on a real daily
  cron requires the user's explicit go-ahead (and, once real LLM curation
  lands, real API keys). For now, fetching a fresh digest means running
  `npm run pipeline` by hand.
- **No live deployment yet.** There is no Vercel (or other) deployment
  configured. The site currently only runs locally via `npm run dev` /
  `npm run build`.
- **No public cost/stats page yet.** Since there is no real LLM curation step
  making paid API calls, there is no real cost to report, so no cost/stats
  page exists.

## License

Apache-2.0
