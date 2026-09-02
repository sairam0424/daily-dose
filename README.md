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

This is a working project, but still growing. Specifically, as of this
writing:

- **Real LLM curation is live**, via AWS Bedrock (`@anthropic-ai/bedrock-sdk`,
  model fallback chain: Claude Sonnet 5 → Sonnet 4.6 → Opus 4.6 → Haiku 4.5,
  Sonnet 5 leading as of ADR 0005). Every
  fetched item (HN + arXiv) is scored in one batched call per pipeline run.
  The original deterministic placeholder heuristic (derived from real,
  already-fetched fields — points/comment count/title for HN, recency for
  arXiv) is kept as an explicit, loudly-logged fallback for local dev
  without credentials, or for any individual item the LLM's response
  happens to omit — it is never silently substituted. See `decisions.md`'s
  ADR 0003 for the full design.
- **Two sources today (Hacker News + arXiv); GitHub is the remaining
  deferred fast-follow.** The pipeline runs both sources by default
  (`--sources hn,arxiv`) — the schema already models a third (`source:
  "github"`) but it hasn't been wired up yet.
- **The daily pipeline now runs automatically.** A dedicated workflow
  (`.github/workflows/daily-pipeline.yml`) runs `npm run pipeline` once a
  day (21:00 UTC) via a real `schedule:` trigger, and commits the result
  itself — see `decisions.md`'s ADR 0004. `.github/workflows/ci.yml` is
  unchanged and still only runs on manual `workflow_dispatch` plus
  push/PR.
- **The site is live.** Visit https://daily-dose-hazel-delta.vercel.app —
  git-integrated auto-deploy on push to `main` (ADR 0004), Build Command
  confirmed as `npm run build` only, so Vercel never runs the pipeline or
  sees the Bedrock credential.
- **A public cost/stats page ships.** Visit `/stats` for real per-run LLM
  cost, broken down by model and by day, read directly from
  `src/data/stats.jsonl` — going one step further than the reference
  project's own `/stats` page, which never showed dollar amounts.

## License

Apache-2.0
