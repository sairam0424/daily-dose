# Context.md — daily-dose

Living state-of-the-world doc. Agents should update this as work progresses — this is not a duplicate of `AGENTS.md`'s static command list.

## What this is

daily-dose is a daily AI-curated technical digest (arXiv + Hacker News) — the author's own version of [arpitbbhayani/the-daily-diff](https://github.com/arpitbbhayani/the-daily-diff). It is one of three independent sibling projects — daily-dose, nh-deck, nh-skills — under the **Not-Humans-Lab** umbrella (`../Not-Humans-Lab/`, a separate docs-only meta-repo). daily-dose is itself a standalone GitHub repository, matching this workspace's polyrepo convention — it is not nested inside Not-Humans-Lab.

nh-skills (`../nh-skills/`) and nh-deck (`../nh-deck/`) are siblings that already completed their own Phase 1-4, fully working, tested, and shipped through real CI — useful precedent for house documentation style/conventions, but their product shapes (a curated skills collection; a local-first presentation CLI) are unrelated to daily-dose's (a content site backed by a data pipeline), so their content is referenced for convention, never copied as architecture.

## Current state (as of 2026-09-02)

- **Phase 9: cron automation, Vercel deployment, and GitHub sourcing all shipped.** Real, live fetch from Hacker News' free Algolia API, arXiv's Atom API, and GitHub's free Search API (ADR 0006); real LLM scoring via AWS Bedrock (`src/lib/llmCuration.ts`, Sonnet 5→Sonnet 4.6→Opus→Haiku fallback chain, Sonnet 5 leading as of ADR 0005) as the default path, with the original deterministic placeholder retained as an explicit no-credentials fallback — see `decisions.md` ADR 0003; an Astro static site rendering committed digests via Content Collections; one Chart.js bar-chart island; a public `/stats` cost page. `.github/workflows/daily-pipeline.yml` now runs the pipeline daily via a real `schedule:` trigger and commits the result itself — see ADR 0004. The site is live at https://daily-dose-hazel-delta.vercel.app, git-integrated auto-deploy on push to `main`, Build Command confirmed as `npm run build` only.
- **Tech stack: decided.** Astro (`output: "static"`) for the front-end, with Content Collections reading `src/data/digest/*.json` via the glob loader, validated against the same Zod schema (`src/lib/digestSchema.ts`) the pipeline script writes against — one schema, two enforcement points, zero drift. A separate TypeScript/Node pipeline script (`scripts/pipeline.ts`, run via `tsx`) fetches from HN's Algolia API and writes one validated file per story into a dated `src/data/digest/YYYY-MM-DD/` folder (Astro's `glob()` content loader requires one schema-matching object per file, not an array). Styling is minimal inline CSS (no Bulma/Sass) for this phase. One Chart.js island (`chart.js/auto` via a plain `<script type="module">`, no React/Vue) renders a bar chart of the day's interest scores.
- **Single-source (Hacker News only) for now — arXiv is explicitly deferred, not forgotten.** This is the single biggest scope gap in the current skeleton and is documented as a fast-follow in the Roadmap below, not silently skipped.
- **Curation is now a real LLM call via AWS Bedrock, with the honest placeholder kept as an explicit fallback.** `src/lib/llmCuration.ts` scores every fetched item (HN + arXiv + GitHub) in one forced-tool-use batched call per pipeline run, using a credential shared with the sibling Anvilry project. `src/lib/curation.ts`'s deterministic placeholders (computed from real, already-fetched fields — `points`/`num_comments` for HN, `stars`/`forks` for GitHub, recency for arXiv) still exist and are used, with a loud console warning, whenever credentials aren't configured (e.g. local dev) or the LLM's response omits a specific item. See `decisions.md`/ADR 0003/ADR 0006 for full rationale and `SOUL.md`'s non-negotiables for why the fallback is never dressed up as real judgment.
- **CI: `ci.yml` still `workflow_dispatch` + `push`/`pull_request` only; a separate `daily-pipeline.yml` now runs the real pipeline on a `schedule:` trigger.** Kept as two distinct workflow files deliberately — `daily-pipeline.yml` requests `contents: write` on itself, `ci.yml` stays read-only. See `decisions.md` ADR 0004.
- **License: Apache-2.0**, decided once at the Not-Humans-Lab system level and applied identically across all three sibling projects (see `../Not-Humans-Lab/decisions.md`).

## Architecture at a glance

Two runtimes, one shared contract:

1. **Pipeline** (`scripts/pipeline.ts`, run via `tsx`) — fetches live from HN's Algolia API, runs the placeholder curation step (`src/lib/curation.ts`) to produce `interest_score` + `why_read` for each story, validates the full result against `src/lib/digestSchema.ts`, and writes one file per story into a dated `src/data/digest/YYYY-MM-DD/` folder (e.g. `hn-49508225.json`).
2. **Site** (Astro, `output: "static"`) — Content Collections (`src/content.config.ts`, glob loader over `src/data/digest/*.json`) read and validate against the exact same `digestSchema.ts`, then render the latest digest on `src/pages/index.astro`, including one inline Chart.js island (a `<script type="module">` block within `index.astro` itself, not a separate component) charting the day's interest scores.

The shared schema is the load-bearing contract between the two runtimes — see `AGENTS.md`'s Directory Map for the concrete file layout, and `../Not-Humans-Lab/architecture.md` for how daily-dose fits into the three-project system (C4 Level 1 only — this repo owns its own internals).

## Key decisions & why

- **Astro static output, not SSR** — this is a content site with no need for a live server at this phase; static generation is simpler to reason about and to deploy later.
- **One schema, two enforcement points (`digestSchema.ts`)** — guarantees the pipeline can never write something the site can't validate, and vice versa, without maintaining two schemas by hand.
- **HN first, arXiv as a fast-follow (now shipped)** — shipping a working one-source skeleton before adding a second, differently-shaped source (Atom/XML, no engagement signal) was the small-and-finishable move; see `../Not-Humans-Lab/SOUL.md`'s "small and finishable over big and impressive." arXiv landed via `fetchArxivPapers()` + `scoreArxivPlaceholder()`, both fetching/scoring for real — see `decisions.md`'s ADR 0002.
- **Real LLM curation via AWS Bedrock, one batched call per run** — a working Bedrock credential now exists (shared with the sibling Anvilry project), so both placeholder scoring functions are superseded as the default path; the placeholder is kept only as an explicit, loudly-logged fallback. One batched forced-tool-use call (not per-item calls, not a tiered cheap/strong-model split) was chosen for simplicity — see `decisions.md`/ADR 0003 for the full options analysis. See `SOUL.md`'s AI-transparency non-negotiable for why the fallback path is never dressed up as real editorial judgment.
- **No Bulma/Sass, minimal inline CSS** — visual polish is a deliberate fast-follow, matching nh-deck's precedent of shipping the working core before styling it.
- **`daily-pipeline.yml` as a separate, dedicated workflow with its own `contents: write` permission, not folded into `ci.yml`** — least-privilege: only the one job that needs to push gets write access, `ci.yml` and every other workflow stay read-only. See `decisions.md` ADR 0004.
- **Vercel deployment is live** (git-integrated, `npm run build` only, never the pipeline) — confirmed via real build logs and by fetching both `/` and `/stats` from the production URL after connecting.
- **License = Apache-2.0** — decided once at the umbrella level, not re-decided per project; see `../Not-Humans-Lab/decisions.md` for the patent-grant rationale.

## Roadmap

In order — do not build out of sequence:

1. ~~Add arXiv as a second source.~~ Done — `fetchArxivPapers()` + `scoreArxivPlaceholder()` both ship and run for real by default (`--sources hn,arxiv`).
2. ~~Wire real LLM scoring once API keys are available.~~ Done — see `decisions.md`/ADR 0003. `src/lib/llmCuration.ts` scores every item via AWS Bedrock as the default path; the placeholder remains an explicit fallback.
3. ~~Enable the `schedule:` cron trigger for automated daily runs.~~ Done — `.github/workflows/daily-pipeline.yml`, see `decisions.md` ADR 0004.
4. ~~Enable real Vercel deployment.~~ Done — live at https://daily-dose-hazel-delta.vercel.app (ADR 0004).
5. ~~Add a public `/stats` cost-transparency page.~~ Done — `src/pages/stats.astro` ships real totals, by-model, and by-day cost breakdowns from `src/data/stats.jsonl`, see `telemetry.md`.
6. ~~Consider a third source (GitHub).~~ Done — see `decisions.md` ADR 0006. `fetchGithubTrendingRepos()` surfaces recently-created, fast-rising repos via GitHub's free, keyless Search API.

## Open risks

- **The placeholder curation heuristic (now only a fallback) has never been validated against real editorial judgment.** Its rankings (derived purely from `points`/`num_comments`) may not resemble what a human or a real model would actually flag as interesting — this only matters now when credentials are missing (local dev) or the LLM omits a specific item's score, since real LLM scoring is the default path.
- **arXiv's placeholder scoring is a weaker signal than HN's** by design (recency only, capped at [3,8], never reaching HN's 9-10 range) — this is documented and intentional (see `decisions.md`'s ADR 0002), not a bug, but it now only affects the fallback path.
- **The Bedrock credential is shared with the sibling Anvilry project's production chatbot** — rotating it is a two-repo operation, and Anvilry's own usage patterns could theoretically affect this project's rate limits. See `SECURITY.md` and ADR 0003.
- **The daily schedule hasn't run unattended yet.** Every digest so far is still the product of a manually-triggered `workflow_dispatch` run — `daily-pipeline.yml`'s real `schedule:` trigger exists but its first genuinely automated run hasn't happened/been observed yet. Confirm a correctly-scoped commit from the first real scheduled run before fully trusting it (see ADR 0004's Confirmation section).
- **Cron is now a real, recurring, unattended AWS spend.** Small (~$0.02–0.05/run) but indefinite until the schedule is disabled — an accepted tradeoff (ADR 0004), not an oversight.
- **`content.config.ts` and `scripts/pipeline.ts` both depend on `digestSchema.ts` staying in sync by construction** (both import the same file), but this has not yet been exercised against a real schema-breaking change — the "zero drift" guarantee is a design intent, not yet a proven one.

---
*Last updated: 2026-09-02. Agents: keep this current as work progresses — do not let it go stale while `AGENTS.md`/`SOUL.md`/`CLAUDE.md` stay static.*
