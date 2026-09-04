# Context.md — daily-dose

Living state-of-the-world doc. Agents should update this as work progresses — this is not a duplicate of `AGENTS.md`'s static command list.

## What this is

daily-dose is a daily AI-curated technical digest (arXiv + Hacker News) — the author's own version of [arpitbbhayani/the-daily-diff](https://github.com/arpitbbhayani/the-daily-diff). It is one of three independent sibling projects — daily-dose, nh-deck, nh-skills — under the **Not-Humans-Lab** umbrella (`../Not-Humans-Lab/`, a separate docs-only meta-repo). daily-dose is itself a standalone GitHub repository, matching this workspace's polyrepo convention — it is not nested inside Not-Humans-Lab.

nh-skills (`../nh-skills/`) and nh-deck (`../nh-deck/`) are siblings that already completed their own Phase 1-4, fully working, tested, and shipped through real CI — useful precedent for house documentation style/conventions, but their product shapes (a curated skills collection; a local-first presentation CLI) are unrelated to daily-dose's (a content site backed by a data pipeline), so their content is referenced for convention, never copied as architecture.

## Current state (as of 2026-09-04)

- **Phase 10: full UI/UX redesign (dual-skin design system), reader-facing transparency features, and a backlog-hardening pass — all shipped.** A dual-skin system (`data-skin="dev"|"newspaper"` + `data-theme="dark"|"light"` on `<html>`, a 12-token CSS custom-property contract in `src/layouts/Layout.astro`) ships two genuinely distinct visual identities via a new `PreferenceControls.astro`: a dark-only "dev-editorial" skin (Space Grotesk display / JetBrains Mono / system-ui body) and a light+dark "newspaper" skin (Fraunces display / Newsreader body / JetBrains Mono, a multi-column story list with a drop-cap lead story). A `/methodology` page surfaces the real LLM scoring rubric, `interestTier()` bucket boundaries, and the real cost/anomaly-detection thresholds by importing the actual constants, never restating them. Per-story reading-time/format badges (`reading_minutes` added to the schema, computed from real word counts where body text exists — arXiv abstract, Dev.to's capped excerpt — falling back to a format label like "Discussion"/"Repo" where it doesn't) and 4 new per-source RSS feeds (`/rss/{hn,arxiv,github,devto}.xml`, reusing the existing combined-feed machinery filtered by source) round out the reader-facing surface. Story cards separately gained tiered borders/hairlines, a container-query bento hero cell, a click-toggle why-read popover, real per-item OG-image/favicon enrichment (`src/lib/imageResolution.ts`), and optional `prefers-reduced-motion`-respecting hover-lift motion. Two real bugs were found and fixed post-ship: the why-read popover overflowing the viewport at narrow widths, and (once fixed) a Newspaper-skin CSS multicolumn-fragmentation bug affecting the same popover — root-caused to a genuine browser rendering quirk (an absolutely-positioned descendant fragmenting across a column break inside a `column-count` ancestor, confirmed via `getClientRects()`), fixed by switching the popover to `position: fixed`. A final 5-item backlog-hardening pass then closed out every remaining Minor review finding from the whole arc: a CSS hover-state fragility, a test type-safety gap, a redundant double-parse in `httpUrlSchema`, an unbounded-concurrency image-fetch burst (now capped via a small `mapWithConcurrency` helper), and a missing `fetch()`-call-shape test.
- **Phase 9: every original roadmap item shipped, plus a digest archive, an RSS feed, and a fourth ingestion source (Dev.to).** Real, live fetch from Hacker News' free Algolia API, arXiv's Atom API, GitHub's free Search API (ADR 0006), and Dev.to's free Articles API (ADR 0007); real LLM scoring via AWS Bedrock (`src/lib/llmCuration.ts`, Sonnet 5→Sonnet 4.6→Opus→Haiku fallback chain, Sonnet 5 leading as of ADR 0005) as the default path, with the original deterministic placeholder retained as an explicit no-credentials fallback — see `decisions.md` ADR 0003; an Astro static site rendering committed digests via Content Collections; one Chart.js bar-chart island; a public `/stats` cost page. `.github/workflows/daily-pipeline.yml` runs the pipeline daily via a real `schedule:` trigger and commits the result itself — see ADR 0004. The site is live at https://daily-dose-hazel-delta.vercel.app, git-integrated auto-deploy on push to `main`, Build Command confirmed as `npm run build` only. Readers can now browse every past day (`/archive/`, `/archive/{date}/`) and subscribe via RSS (`/rss.xml`) — see `decisions.md`'s 2026-09-03 log entry.
- **Tech stack: decided.** Astro (`output: "static"`, with `site` now configured for `@astrojs/rss`) for the front-end, with Content Collections reading `src/data/digest/*.json` via the glob loader, validated against the same Zod schema (`src/lib/digestSchema.ts`) the pipeline script writes against — one schema, two enforcement points, zero drift. A separate TypeScript/Node pipeline script (`scripts/pipeline.ts`, run via `tsx`) fetches from HN's Algolia API, arXiv's Atom API, GitHub's Search API, and Dev.to's Articles API, and writes one validated file per item into a dated `src/data/digest/YYYY-MM-DD/` folder (Astro's `glob()` content loader requires one schema-matching object per file, not an array). Styling is minimal inline CSS (no Bulma/Sass) for this phase. `DigestList.astro`/`DigestChart.astro` are shared components reused across `index.astro` and the archive pages. One Chart.js island (`chart.js/auto` via a plain `<script type="module">`, no React/Vue) renders a bar chart of interest scores.
- **Curation is now a real LLM call via AWS Bedrock, with the honest placeholder kept as an explicit fallback.** `src/lib/llmCuration.ts` scores every fetched item (HN + arXiv + GitHub + Dev.to) in one forced-tool-use batched call per pipeline run, using a credential shared with the sibling Anvilry project. `src/lib/curation.ts`'s deterministic placeholders (computed from real, already-fetched fields — `points`/`num_comments` for HN, `stars`/`forks` for GitHub, `reactions`/`comments` for Dev.to, recency for arXiv) still exist and are used, with a loud console warning, whenever credentials aren't configured (e.g. local dev) or the LLM's response omits a specific item. See `decisions.md`/ADR 0003/ADR 0006/ADR 0007 for full rationale and `SOUL.md`'s non-negotiables for why the fallback is never dressed up as real judgment.
- **CI: `ci.yml` still `workflow_dispatch` + `push`/`pull_request` only; a separate `daily-pipeline.yml` now runs the real pipeline on a `schedule:` trigger.** Kept as two distinct workflow files deliberately — `daily-pipeline.yml` requests `contents: write` on itself, `ci.yml` stays read-only. See `decisions.md` ADR 0004. `daily-pipeline.yml` also now requests `issues: write` on itself (still only itself) for a new `if: failure()` step that auto-files/updates a labeled GitHub Issue on a scheduled-run failure — see ADR 0004's Update section.
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
- **Dev.to as the fourth source, chosen over Reddit/Lobste.rs/Product Hunt** — Dev.to's free, keyless Articles API has a genuine two-signal engagement proxy (reactions/comments) and a content shape (long-form first-person technical writing) genuinely distinct from the other three sources; the alternatives were either dead (Reddit, all unauthenticated paths return 403/redirect-to-login), ToS-adjacent-risk (Lobste.rs's `robots.txt` explicitly disallows AI input/training), or gated behind OAuth2 (Product Hunt's only engagement-bearing surface) — see `decisions.md`/ADR 0007.
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
7. ~~Add a digest archive/history page.~~ Done — `/archive/`, `/archive/{date}/`. See `decisions.md`'s 2026-09-03 log entry.
8. ~~Add an RSS feed.~~ Done — `/rss.xml` via `@astrojs/rss`, one `<item>` per day.
9. ~~Add richer failure alerting for the scheduled cron (ADR 0004's deferred non-goal).~~ Done — `daily-pipeline.yml`'s new `if: failure()` step (`actions/github-script@v7`) auto-files a labeled GitHub Issue with the failed run's URL and timestamp, or comments on the existing open one on repeat failures. No new secret. See ADR 0004's Update section and `decisions.md`'s 2026-09-03 log entry.
10. ~~Favicon + social preview (OG) image.~~ Done — `public/favicon.svg` and
    `public/og-image.png` (1200×630), both static files generated once via
    a headless browser and committed, not regenerated at build time (no
    new npm dependency). Wired into every page's `<head>` via a new shared
    `src/components/SiteMeta.astro`. See `decisions.md`'s 2026-09-03 log
    entry.
11. ~~Add a fourth source.~~ Done — see `decisions.md` ADR 0007.
    `fetchDevtoArticles()` surfaces today's "hot right now" Dev.to articles
    via Dev.to's free, keyless Articles API, with a per-article call for the
    real, bounded-length body text.
12. ~~Custom domain.~~ Decided (2026-09-03): staying on the free
    `daily-dose-hazel-delta.vercel.app` URL, no purchase. Researched twice:
    first the paid-registrar comparison (`dailydose` is taken everywhere;
    `daily-dose` is open on `.dev`/`.xyz`/`.io`/`.news`/`.day`; cheapest real
    total cost is `daily-dose.dev` via Cloudflare Registrar at ~$10-12/yr
    flat), then a genuinely-free-option pass. The one real free candidate,
    `daily-dose.is-a.dev` (a free, Cloudflare-DNS-sponsored community
    subdomain service, real and currently active), was explicitly passed
    over: its PR review rejects sites that aren't "software development
    related" (a curated AI-news digest is a genuine 50/50 there), and its
    maintainers explicitly ask contributors not to have AI draft the
    registration request. If revisited later, the exact JSON schema, CNAME
    target, and full registrar price comparison are preserved in this
    file's git history — don't re-research from scratch.
13. ~~Sonnet 5 per-token price confirmation.~~ Done (2026-09-03) — see
    ADR 0005's Update section. Confirmed via Anthropic's own pricing page
    plus AWS's public Price List Bulk API: the real rate for this
    project's exact model ID is $2.20/$11.00 per million input/output
    tokens, corrected in `costTracking.ts` (was $3/$15, an unconfirmed
    placeholder).
14. ~~Add a `/methodology` page.~~ Done — `src/pages/methodology.astro`
    imports real constants directly from `llmCuration.ts`/`interestTier.ts`/
    `costTracking.ts` (never restates them), with a masthead nav link added
    to every page.
15. ~~Add reading-time/format badges.~~ Done — `reading_minutes` added to
    `digestSchema.ts`, computed by the pipeline from real word counts
    (arXiv's abstract, Dev.to's capped excerpt) where body text exists; a
    format label ("Discussion"/"Repo") is shown instead where it doesn't.
    New `src/lib/readingTime.ts`.
16. ~~Add per-source RSS feeds.~~ Done — `/rss/hn.xml`, `/rss/arxiv.xml`,
    `/rss/github.xml`, `/rss/devto.xml`, each filtering to one source before
    reusing the existing `renderDayContent()`/`rss()` machinery unmodified,
    alongside the existing combined `/rss.xml`.
17. ~~Full UI/UX redesign — dual-skin design system.~~ Done — a
    dev-editorial skin and a newspaper skin, switchable via a new
    `PreferenceControls.astro`, sharing a 12-token CSS custom-property
    contract (`Layout.astro`); Newspaper renders the story list as a
    multi-column layout with a drop-cap lead story.
18. ~~UI/UX polish pass (borders, bento hero, real images, hover motion).~~
    Done — tiered card borders/hairlines, a container-query bento hero
    cell, a click-toggle why-read popover, real OG-image/favicon
    enrichment (`src/lib/imageResolution.ts`), and optional hover-lift
    motion that respects `prefers-reduced-motion`.
19. ~~Fix why-read popover viewport overflow + Newspaper multicolumn
    fragmentation.~~ Done — the popover now uses `position: fixed` with
    JS-computed, viewport-clamped `top`/`left` (`positionPanel()` in
    `StoryCard.astro`), which also escapes the CSS multicolumn-fragmentation
    bug the first fix's own follow-up review caught.
20. ~~Backlog-hardening pass.~~ Done (2026-09-04) — closed 5 remaining
    Minor review findings accumulated across items 14-19: an explicit
    `border-color` reset on Newspaper's card-hover state, type-safe Zod
    result narrowing in a test, a single-parse `httpUrlSchema`, a
    `mapWithConcurrency`-capped image-resolution fetch step, and a new test
    asserting `resolveItemImage`'s real `fetch()` call shape.

Every item above is shipped or decided. There is no open backlog item
remaining as of 2026-09-04.

## Open risks

- **The placeholder curation heuristic (now only a fallback) has never been validated against real editorial judgment.** Its rankings (derived purely from `points`/`num_comments`) may not resemble what a human or a real model would actually flag as interesting — this only matters now when credentials are missing (local dev) or the LLM omits a specific item's score, since real LLM scoring is the default path.
- **arXiv's placeholder scoring is a weaker signal than HN's** by design (recency only, capped at [3,8], never reaching HN's 9-10 range) — this is documented and intentional (see `decisions.md`'s ADR 0002), not a bug, but it now only affects the fallback path.
- **The Bedrock credential is shared with the sibling Anvilry project's production chatbot** — rotating it is a two-repo operation, and Anvilry's own usage patterns could theoretically affect this project's rate limits. See `SECURITY.md` and ADR 0003.
- ~~The daily schedule hasn't run unattended yet.~~ **Resolved (2026-09-04):** confirmed via real `schedule`-triggered (not `workflow_dispatch`) completions on 2026-09-02 and 2026-09-03, each producing a correctly-scoped commit. Real Bedrock scoring of the newest source (Dev.to) is also confirmed live — `src/data/digest/2026-09-03/devto-4534883.json`'s `why_read` reads as genuine model judgment, not the deterministic placeholder pattern.
- **Cron is now a real, recurring, unattended AWS spend.** Small (~$0.02–0.05/run) but indefinite until the schedule is disabled — an accepted tradeoff (ADR 0004), not an oversight.
- **`content.config.ts` and `scripts/pipeline.ts` both depend on `digestSchema.ts` staying in sync by construction** (both import the same file), but this has not yet been exercised against a real schema-breaking change — the "zero drift" guarantee is a design intent, not yet a proven one.

---
*Last updated: 2026-09-04. Agents: keep this current as work progresses — do not let it go stale while `AGENTS.md`/`SOUL.md`/`CLAUDE.md` stay static.*
