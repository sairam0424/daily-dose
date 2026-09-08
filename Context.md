# Context.md — daily-dose

Living state-of-the-world doc. Agents should update this as work progresses — this is not a duplicate of `AGENTS.md`'s static command list.

## What this is

daily-dose is a daily AI-curated technical digest (arXiv + Hacker News) — the author's own version of [arpitbbhayani/the-daily-diff](https://github.com/arpitbbhayani/the-daily-diff). It is one of three independent sibling projects — daily-dose, nh-deck, nh-skills — under the **Not-Humans-Lab** umbrella (`../Not-Humans-Lab/`, a separate docs-only meta-repo). daily-dose is itself a standalone GitHub repository, matching this workspace's polyrepo convention — it is not nested inside Not-Humans-Lab.

nh-skills (`../nh-skills/`) and nh-deck (`../nh-deck/`) are siblings that already completed their own Phase 1-4, fully working, tested, and shipped through real CI — useful precedent for house documentation style/conventions, but their product shapes (a curated skills collection; a local-first presentation CLI) are unrelated to daily-dose's (a content site backed by a data pipeline), so their content is referenced for convention, never copied as architecture.

## Current state (as of 2026-09-07)

- **Phase 13: a structural UI overhaul benchmarked directly against the tdd.cat reference (arpitbbhayani/the-daily-diff), plus a 7-item E2E audit-fixes round — all shipped.** A sustained side-by-side comparison against tdd.cat drove a full pass on navigation and chrome: the newspaper masthead title was enlarged and renamed to "The Daily Dose," the native `<input type=date>` picker was replaced with real prev/next-day links, backed by a new `src/pages/404.astro` page and a scroll-to-top button gated on real page length and triggered via `IntersectionObserver`; `FilterBar.astro` was rebuilt into a single bold-bordered Source/Signal row with a live "Showing X of Y stories" status line; and the homepage's utility bar went through several real-viewport-measured iterations (a 3-zone layout, a 4th story-count zone added then removed as redundant with text immediately below it) before settling on a clean 3-zone row. `j`/`k` now move real keyboard focus between story links for next/previous-story navigation and `t` jumps to the top — a mature reading-list convention (Gmail/Reeder/Feedly-style) — reusing `StoryCard.astro`'s existing `:focus-visible` styling rather than adding new CSS. The always-fixed theme toggle (`PreferenceControls.astro`) was moved out of its floating viewport-corner overlay into each page's own masthead-utility row as a real editorial-site convention (not the SaaS-dashboard one), with the scroll-to-top button's `right` offset updated to track the content sheet's edge instead of the raw viewport. Favicon-fallback (`onerror` self-removal), archive-column-balance (`break-inside: auto`), and page-sheet-background fixes, plus a live-region (`role="status"`) and visual-prominence fix for the empty-filter-results state (closing a real WCAG 4.1.3 gap), rounded out the pass. A final 7-item round then closed every finding from a full end-to-end responsive/functional/accessibility audit: `/stats`'s cost tables wrapped in an accessible scrollable region (`role="region"`, `tabindex="0"`) after they were forcing page-wide horizontal scroll on mobile; missing `:focus-visible` outlines added on archive date links plus a new global fallback rule; a favicon cross-origin console error closed by verifying reachability before persisting a URL — and, after chart-label-truncation and layout fixes didn't resolve real jank in browser testing, the Interest-scores Chart.js bar chart was removed from `/stats` entirely — component, its test, and the `chart.js` dependency all deleted; there is no chart anywhere on the site as of this writing.
- **Phase 12: a content-quality and pipeline-safety pass — per-story analysis, honest image handling, and harmful-content exclusion, all shipped.** An optional `analysis` field was added to `digestSchema.ts` and to the real Bedrock scoring contract: the LLM judges its own write-up against the real source excerpt for arXiv/Dev.to and writes directly for HN/GitHub (the placeholder fallback never produces one), rendered inline on `StoryCard.astro`. A real pipeline run surfacing arXiv's identical repeated logo, a `%20`-mangled image URL, and forced-crop CSS drove an image-handling redesign: a new arXiv ar5iv figure fallback, URL sanitization plus a real HTTP HEAD reachability check before accepting any resolved image URL, and letterboxing instead of cropping. Most consequentially, a real pipeline run surfaced a real GitHub repo for a non-consensual AI image tool that the LLM correctly scored 0 and flagged as harmful in `why_read`/`analysis` — with no mechanism to act on that judgment beyond the number — so `llmCuration.ts` now also returns `exclude: boolean` on the same structured Bedrock call, and `pipeline.ts` skips writing any flagged item entirely (no file, no card, no image), verified directly against the real incident item; `curation.ts`'s placeholder fallback is unchanged, since it cannot judge harm. (Process note: this feature's design spec — `docs/superpowers/specs/2026-09-05-harmful-content-exclusion-design.md` — shipped without a matching implementation-plan doc, unlike this session's other spec+plan pairs; a minor process gap, not a functional one — the feature itself is fully implemented and live.) Three real Bedrock-pipeline/CI incidents surfaced across this work were each fixed: a daily-pipeline non-fast-forward push race (a `git pull --rebase --autostash` step now runs immediately before the auto-commit), a Bedrock quirk returning `scores` as a JSON-encoded string instead of a real array (now tolerated before Zod validation), and a truncated-scores-JSON crash once `analysis` lengthened per-item output (`max_tokens` raised 8192→16000, malformed-JSON responses made retryable across the model fallback chain like other errors already were).
- **Phase 11: a newspaper-polish, owner-gating, and rebrand pass — all shipped.** The per-page AI-disclosure banner was replaced with a minimal footer colophon (disclosure still lives on `/methodology`, satisfying `SOUL.md`'s "without digging" bar); the public numeric interest-score badge and its chart were removed from every reader-facing page. The masthead was centered and given a new sunrise-glyph logo (favicon, masthead mark, and a regenerated OG image, chosen via a 4-round visual-companion brainstorming session) and, later, a real typographic/compositional structure (a small, uppercase "eyebrow" utility row sitting above a tightly-grouped `<hgroup>` brand block, no rule between them). `/stats` moved to on-demand rendering (the `@astrojs/vercel` adapter, `output: "static"` kept as the default for every other route) behind HTTP Basic Auth scoped to that one route only — a real trailing-slash auth-bypass a security review caught was closed by extracting an explicit `isStatsPath()` check — and the interest-score chart moved there from the public pages (ahead of its later full removal in Phase 13). Archive dates gained real per-day previews (the lead story's title/`why_read` excerpt/image) and a masthead date-jump control (a plain `<input type=date>`, later replaced in Phase 13); Methodology moved out of top nav into a new shared `SiteFooter.astro` present on every page. Vercel Speed Insights was also added alongside the existing Analytics integration.
- **Phase 10: full UI/UX redesign (dual-skin design system), reader-facing transparency features, and a backlog-hardening pass — all shipped.** A dual-skin system (`data-skin="dev"|"newspaper"` + `data-theme="dark"|"light"` on `<html>`, a 12-token CSS custom-property contract in `src/layouts/Layout.astro`) ships two genuinely distinct visual identities via a new `PreferenceControls.astro`: a dark-only "dev-editorial" skin (Space Grotesk display / JetBrains Mono / system-ui body) and a light+dark "newspaper" skin (Fraunces display / Newsreader body / JetBrains Mono, a multi-column story list with a drop-cap lead story). A `/methodology` page surfaces the real LLM scoring rubric, `interestTier()` bucket boundaries, and the real cost/anomaly-detection thresholds by importing the actual constants, never restating them. Per-story reading-time/format badges (`reading_minutes` added to the schema, computed from real word counts where body text exists — arXiv abstract, Dev.to's capped excerpt — falling back to a format label like "Discussion"/"Repo" where it doesn't) and 4 new per-source RSS feeds (`/rss/{hn,arxiv,github,devto}.xml`, reusing the existing combined-feed machinery filtered by source) round out the reader-facing surface. Story cards separately gained tiered borders/hairlines, a container-query bento hero cell, a click-toggle why-read popover, real per-item OG-image/favicon enrichment (`src/lib/imageResolution.ts`), and optional `prefers-reduced-motion`-respecting hover-lift motion. Two real bugs were found and fixed post-ship: the why-read popover overflowing the viewport at narrow widths, and (once fixed) a Newspaper-skin CSS multicolumn-fragmentation bug affecting the same popover — root-caused to a genuine browser rendering quirk (an absolutely-positioned descendant fragmenting across a column break inside a `column-count` ancestor, confirmed via `getClientRects()`), fixed by switching the popover to `position: fixed`. A final 5-item backlog-hardening pass then closed out every remaining Minor review finding from the whole arc: a CSS hover-state fragility, a test type-safety gap, a redundant double-parse in `httpUrlSchema`, an unbounded-concurrency image-fetch burst (now capped via a small `mapWithConcurrency` helper), and a missing `fetch()`-call-shape test.
- **Phase 9: every original roadmap item shipped, plus a digest archive, an RSS feed, and a fourth ingestion source (Dev.to).** Real, live fetch from Hacker News' free Algolia API, arXiv's Atom API, GitHub's free Search API (ADR 0006), and Dev.to's free Articles API (ADR 0007); real LLM scoring via AWS Bedrock (`src/lib/llmCuration.ts`, Sonnet 5→Sonnet 4.6→Opus→Haiku fallback chain, Sonnet 5 leading as of ADR 0005) as the default path, with the original deterministic placeholder retained as an explicit no-credentials fallback — see `decisions.md` ADR 0003; an Astro static site rendering committed digests via Content Collections; one Chart.js bar-chart island; a public `/stats` cost page. `.github/workflows/daily-pipeline.yml` runs the pipeline daily via a real `schedule:` trigger and commits the result itself — see ADR 0004. The site is live at https://daily-dose-hazel-delta.vercel.app, git-integrated auto-deploy on push to `main`, Build Command confirmed as `npm run build` only. Readers can now browse every past day (`/archive/`, `/archive/{date}/`) and subscribe via RSS (`/rss.xml`) — see `decisions.md`'s 2026-09-03 log entry.
- **Tech stack: decided.** Astro (`output: "static"`, with `site` now configured for `@astrojs/rss`) for the front-end, with Content Collections reading `src/data/digest/*.json` via the glob loader, validated against the same Zod schema (`src/lib/digestSchema.ts`) the pipeline script writes against — one schema, two enforcement points, zero drift. A separate TypeScript/Node pipeline script (`scripts/pipeline.ts`, run via `tsx`) fetches from HN's Algolia API, arXiv's Atom API, GitHub's Search API, and Dev.to's Articles API, and writes one validated file per item into a dated `src/data/digest/YYYY-MM-DD/` folder (Astro's `glob()` content loader requires one schema-matching object per file, not an array). Styling is minimal inline CSS (no Bulma/Sass) for this phase. `DigestList.astro` is a shared component reused across `index.astro` and the archive pages. The one Chart.js island that used to render a bar chart of interest scores (`DigestChart.astro`) was later moved to the owner-gated `/stats` page (Phase 11) and then removed entirely in the Phase 13 audit-fixes round — `chart.js` is gone from `package.json` and there is no chart anywhere on the site as of this writing.
- **Curation is now a real LLM call via AWS Bedrock, with the honest placeholder kept as an explicit fallback.** `src/lib/llmCuration.ts` scores every fetched item (HN + arXiv + GitHub + Dev.to) in one forced-tool-use batched call per pipeline run, using a credential shared with the sibling Anvilry project. `src/lib/curation.ts`'s deterministic placeholders (computed from real, already-fetched fields — `points`/`num_comments` for HN, `stars`/`forks` for GitHub, `reactions`/`comments` for Dev.to, recency for arXiv) still exist and are used, with a loud console warning, whenever credentials aren't configured (e.g. local dev) or the LLM's response omits a specific item. See `decisions.md`/ADR 0003/ADR 0006/ADR 0007 for full rationale and `SOUL.md`'s non-negotiables for why the fallback is never dressed up as real judgment. As of Phase 12, the same batched call also returns an optional `analysis` field (a longer per-item write-up) and an `exclude: boolean` flag; `pipeline.ts` skips writing any item the LLM flags `exclude: true` entirely, and the placeholder fallback produces neither field, since it cannot judge harm.
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
21. ~~Newspaper-polish, owner-gated-stats, and rebrand pass.~~ Done — see
    Phase 11 above: footer AI-disclosure banner replaced with a minimal
    colophon, public numeric interest-score badge and chart removed,
    masthead centered with a new sunrise-glyph logo (favicon/masthead
    mark/OG image) and later a real compositional structure, `/stats`
    gated behind on-demand rendering + HTTP Basic Auth (a real
    trailing-slash bypass closed via `isStatsPath()`), richer archive
    previews plus a masthead date-jump control, Methodology moved into a
    shared `SiteFooter.astro`, and Vercel Speed Insights added.
22. ~~Content-quality and pipeline-safety pass.~~ Done — see Phase 12
    above: an optional per-story `analysis` field on the schema and the
    real Bedrock contract, an image-handling redesign (arXiv ar5iv
    fallback, URL sanitization + a real reachability check, letterboxing
    instead of cropping), harmful-content exclusion (`exclude: boolean`
    on the same Bedrock call, enforced in `pipeline.ts`), and three real
    Bedrock/CI resilience fixes this work surfaced (a daily-pipeline push
    race, a stringified-`scores` quirk, and a truncated-JSON crash fixed
    via a higher `max_tokens` + a wider retry set).
23. ~~Structural UI overhaul vs. the tdd.cat reference, plus a 7-item E2E
    audit-fixes round.~~ Done (2026-09-07) — see Phase 13 above: an
    enlarged/renamed masthead title, prev/next-day nav replacing the
    date-picker, a new 404 page and scroll-to-top button, `j`/`k`
    story-navigation keyboard shortcuts, a rebuilt filter/utility bar,
    the theme toggle moved inline into the masthead, a redundant
    story-count zone removed, empty-state accessibility/prominence
    fixes, and a final audit round (mobile `/stats` table overflow,
    missing focus-visible outlines, a favicon CORS fix, and removing the
    Chart.js `/stats` chart entirely — component, test, and dependency).

Every item above is shipped or decided. There is no open backlog item
remaining as of 2026-09-07.

## Open risks

- **The placeholder curation heuristic (now only a fallback) has never been validated against real editorial judgment.** Its rankings (derived purely from `points`/`num_comments`) may not resemble what a human or a real model would actually flag as interesting — this only matters now when credentials are missing (local dev) or the LLM omits a specific item's score, since real LLM scoring is the default path.
- **arXiv's placeholder scoring is a weaker signal than HN's** by design (recency only, capped at [3,8], never reaching HN's 9-10 range) — this is documented and intentional (see `decisions.md`'s ADR 0002), not a bug, but it now only affects the fallback path.
- **The Bedrock credential is shared with the sibling Anvilry project's production chatbot** — rotating it is a two-repo operation, and Anvilry's own usage patterns could theoretically affect this project's rate limits. See `SECURITY.md` and ADR 0003.
- ~~The daily schedule hasn't run unattended yet.~~ **Resolved (2026-09-04):** confirmed via real `schedule`-triggered (not `workflow_dispatch`) completions on 2026-09-02 and 2026-09-03, each producing a correctly-scoped commit. Real Bedrock scoring of the newest source (Dev.to) is also confirmed live — `src/data/digest/2026-09-03/devto-4534883.json`'s `why_read` reads as genuine model judgment, not the deterministic placeholder pattern.
- **Cron is now a real, recurring, unattended AWS spend.** Small (~$0.02–0.05/run) but indefinite until the schedule is disabled — an accepted tradeoff (ADR 0004), not an oversight.
- **`content.config.ts` and `scripts/pipeline.ts` both depend on `digestSchema.ts` staying in sync by construction** (both import the same file), but this has not yet been exercised against a real schema-breaking change — the "zero drift" guarantee is a design intent, not yet a proven one.
- **Production Vercel deploy is queued behind a Hobby-plan build-rate-limit (as of 2026-09-08).** Two merged, tested fixes — the favicon browser-cache-bust (PR #97) and the mobile masthead/filter-bar reflow (PR #98) — are on `main` and confirmed correct locally, but `https://daily-dose-hazel-delta.vercel.app` won't reflect them until Vercel's own daily build cap resets (its status check reads "Deployment rate limited — retry in 24 hours"). Self-resolving, not a code issue; no action needed unless it recurs often enough to justify a Pro upgrade.
- **Archive index (`/archive/`) is a flat, ungrouped list — confirmed fine at current scale and well beyond it; the earlier ~365 threshold was based on the wrong reference class and is now corrected.** The original `/deep-research` pass compared against tdd.cat (47 entries, lower cadence) and long-running weeklies (Stratechery, Daring Fireball), concluding year headings become worth adding past ~365 entries. A follow-up pass specifically sought out real **daily**-cadence comparables instead and found two: The Rundown AI (1,341 entries) and The Neuron (~1,000+ entries) — both stay fully flat, with plain numbered pagination as their only scaling mechanism, well past 3x the old ~365 figure. Even Stratechery, which does use year headings, pairs them with pagination rather than relying on headings alone. **Revised guidance:** pagination (not year/month `<h2>` grouping) is the correct first scaling lever for a true daily-cadence site like this one, and the real trigger point is meaningfully later than 365 entries — likely closer to 1,000+ based on the closest real comparables found. No code change needed at current scale; if/when it's revisited, implement plain numbered pagination first, and only consider year headings as a secondary aid much later. Still no case for a search library (e.g. Pagefind) — browser Ctrl+F remains sufficient at every scale checked.
- **`srcset`/`sizes` on hotlinked third-party images — researched and closed, not applicable.** No real width variants exist for any of this project's 3 real image sources (GitHub's `opengraph.githubassets.com`, ar5iv figure rendering, arbitrary third-party `og:image` URLs — all confirmed empirically to serve one fixed file regardless of query params). The layout-shift concern this kind of finding usually targets is already solved here via the existing `width`/`height` attributes plus `.story-image`'s `aspect-ratio`/`object-fit` CSS — Google's own prescribed fix for that problem, just via a different mechanism than `srcset`.
- **Editorial analysis reading level confirmed genuinely difficult via direct Flesch-Kincaid measurement** (Reading Ease 19.2, Grade Level 16.4, computed against 20 real committed `analysis` fields) — beyond even the 40-60/9.5-16 range research found normal for dense technical documentation, so this is a real finding, not an SEO-audit false alarm calibrated for the wrong audience. No legitimate UI-only fix exists: truncating the text to a shorter view doesn't change its actual reading level (a shortened dense sentence is still just as dense per word), and NN/g's own progressive-disclosure guidance argues against defaulting to a heavily truncated view regardless. A real fix means editing `llmCuration.ts`'s prompt — requires its own dedicated plan-mode review given the real cost/prompt-injection considerations already engineered into that file (see CLAUDE.md). Not pursued in this pass by design, not oversight. **Follow-up `/deep-research` pass (2026-09-08) on the fix itself, adversarially verified:** the accuracy-vs-simplicity tradeoff is real and well-documented across multiple ACL/EMNLP/arXiv papers on LLM text simplification (PLABA, RephQA, Devaraj et al.'s factuality study, DS@GT CLEF SimpleText, Google Research's Gemini simplification work) — aggressive simplification measurably risks factual drift, information loss, and subtle changes to a claim's epistemic status, even under explicit fidelity-preserving prompt instructions. But prompting-only fixes (no fine-tuning) can work without an accuracy cost — RephQA found a plain readability-focused prompt addition dropped FK grade level while accuracy held or improved for some models, though it caused a real ~15-point accuracy drop for others — i.e. outcome is model/wording-dependent, not automatically safe. Flesch-Kincaid itself correlates poorly with human-judged readability (multiple papers), so re-measuring FK alone is not sufficient to verify a fix worked; manual review of a small real sample (dozens, not thousands, per one source's own endorsed practice) checking both readability *and* technical fidelity is the right-sized verification. Cost impact of adding a reading-level instruction is negligible either way (fixed, tiny per-run prompt-token cost on Sonnet 5 at $2/$10 per million tokens — note Anthropic's own pricing page shows no expiration on this rate, so don't bank on it reverting to $3/$15 by a specific date). Recommended concrete change (not yet implemented, pending its own plan-mode review): add one line to `buildPrompt()` asking for plain-English phrasing over jargon *where equivalent meaning exists*, paired explicitly with "do not omit or soften technical claims, numbers, or nuance for simplicity" — targeting vocabulary/phrasing rather than content, the dimension the research found prompting can safely move. Verify via manual before/after comparison on ~10-20 real recent items (not automated FK re-scoring alone).

---
*Last updated: 2026-09-08. Agents: keep this current as work progresses — do not let it go stale while `AGENTS.md`/`SOUL.md`/`CLAUDE.md` stay static.*
