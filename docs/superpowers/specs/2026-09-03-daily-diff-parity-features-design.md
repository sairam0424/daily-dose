# Design: daily-diff feature-parity and transparency improvements

**Status:** Approved, 2026-09-03
**Authored via:** `superpowers:brainstorming` (architectural path)

## Context and purpose

A dynamic research workflow ran an end-to-end feature comparison of
daily-dose against its inspiration, `arpitbbhayani/the-daily-diff`
(live at tdd.cat), covering both projects' real source code, live
sites, GitHub issues/PRs, and maintainer intent. Full findings live in
this session's transcript; the short version: the-daily-diff's actual
ingestion/scoring pipeline is not public (no fetcher code, no LLM SDK,
no CI), while daily-dose's is fully public, tested, and CI-gated — but
the-daily-diff's live site has several real, verified UI/UX features
daily-dose lacks.

This spec covers building the 6 features the gap analysis recommended,
phased by priority, as one batch since none of them restructure how
the site's components fit together in a way that requires independent
spec cycles — they are additive site-level features sharing one theme
(closing verified feature gaps without importing the-daily-diff's
poor fits, per the gap analysis's "explicitly not recommended" list:
no per-story AI images, no PWA/offline, no accounts, no CSS framework,
no custom domain, no multi-axis scoring).

**Goal state:** daily-dose renders HN discussion links, supports a
persisted dark/light theme, exposes a public machine-readable JSON
feed, has real page-view analytics, offers a working source/signal
filter (with the "All" option the-daily-diff's own filter lacks), and
has a sitemap — with zero changes to the publish path
(`scripts/pipeline.ts`, `src/lib/{llmCuration,curation,costTracking,
digestSchema}.ts`), so none of this work requires this repo's
plan-mode gate for touching that path.

## Decisions resolved during brainstorming

1. **Scope:** all 6 items from the gap analysis, phased by original
   priority order — not split into a smaller first batch.
2. **Layout refactor:** extract a shared `src/layouts/Layout.astro`
   as part of Phase 2, rather than duplicating the theme-toggle
   script/CSS across all 4 existing pages (which currently each
   define their own `:root` CSS variables and `<head>` markup
   independently — a real, pre-existing duplication problem this
   work is touching anyway).
3. **JSON endpoint scope:** `/latest.json` returns only the most
   recent day's items (mirrors `index.astro`'s existing scope and
   the-daily-diff's own `/json` endpoint), not full history.

## Phase 1 — Render the HN discussion link

**What:** `DigestList.astro` already receives `entry.data.hn_id`
(defined in `src/lib/digestSchema.ts`) but never renders it. Add a
conditional `Discuss →` link pointing to
`https://news.ycombinator.com/item?id={hn_id}`
(`target="_blank" rel="noopener noreferrer"`), rendered only when
`hn_id` is present, alongside the existing `points`/`why_read` line.

**Files touched:** `src/components/DigestList.astro`.

**Done when:** every HN-sourced story card in a real build shows a
working `Discuss →` link to its actual HN thread; arXiv/GitHub/Dev.to
cards render unchanged (no `hn_id`, so no link). No schema change, no
new dependency.

## Phase 2 — Shared Layout + dark/light theme toggle

**What:**
1. Extract `src/layouts/Layout.astro` — accepts `title`/`description`
   props, renders `<html>`/`<head>` (delegating meta tags to the
   existing `SiteMeta.astro`), the shared `:root` CSS custom
   properties plus a `[data-theme="dark"]` override block (an
   attribute selector the toggle script controls directly — not a
   `prefers-color-scheme` media query, matching the-daily-diff's own
   verified real pattern), and a `<slot />` for page content.
2. Migrate all 4 existing pages (`index.astro`, `stats.astro`,
   `archive/index.astro`, `archive/[date].astro`) to use it, removing
   their duplicated `<style>`/`<head>` blocks.
3. Add `src/components/ThemeToggle.astro` — an icon-only button plus
   an inline `<script>` that reads `localStorage.getItem('theme')` on
   load (default: light if unset), toggles
   `document.documentElement.dataset.theme` on click, and persists via
   `localStorage.setItem('theme', ...)`.

**Explicit accepted tradeoff:** no FOUC (flash-of-wrong-theme)
prevention via a blocking inline `<head>` script — a brief flash on
load is acceptable for a static personal digest site; not worth the
added complexity.

**Files touched:** new `src/layouts/Layout.astro`,
`src/components/ThemeToggle.astro`; modified `src/pages/index.astro`,
`src/pages/stats.astro`, `src/pages/archive/index.astro`,
`src/pages/archive/[date].astro`.

**Done when:** all 4 pages render identically to their pre-refactor
output under the existing e2e test suite (proves the migration
preserved behavior), a real toggle click flips the theme and persists
across a reload, and one new test asserts the toggle button and
persistence script exist in `dist/` output.

## Phase 3 — `/latest.json` public endpoint

**What:** new `src/pages/latest.json.ts`, structurally mirroring the
existing `src/pages/rss.xml.ts` pattern: calls the shared
`groupEntriesByDate()` (`src/lib/digestGrouping.ts`), takes the first
(most recent) group if one exists, and returns each item's `entry.data`
as a raw JSON array via `Response.json()`.

**Files touched:** new `src/pages/latest.json.ts`.

**Done when:** `GET /latest.json` on a real build returns a JSON array
matching the same items `index.astro` renders, with
`Content-Type: application/json`; an empty digest directory (fresh
clone) returns `[]`, not an error — consistent with `index.astro`'s
existing empty-state handling.

## Phase 4 — Vercel Web Analytics

**Depends on Phase 2** (requires `Layout.astro` to exist).

**What:** add the `@vercel/analytics` package (official Astro
integration, `@vercel/analytics/astro`), wire its `<Analytics />`
component into `Layout.astro` (site-wide, not just `/stats`).

**Explicit real constraint, not a surprise later:** Vercel Web
Analytics data is collected client-side and is only queryable via
Vercel's own dashboard — it cannot be read at static-build time the
way `stats.jsonl` is. `/stats` therefore gets a short, static note
plus a plain link to `https://vercel.com/<team>/daily-dose/analytics`
(the private, login-gated dashboard), **not** an inline real-number
chart like the LLM-cost section already has. Making that dashboard
*publicly* shareable (Vercel supports a public analytics link) is a
manual, account-level Vercel setting the user can optionally flip
later — it is not part of this phase's code and not required for
Phase 4 to be considered done.

**Files touched:** `package.json` (new dependency),
`src/layouts/Layout.astro`, `src/pages/stats.astro`.

**Done when:** the Analytics script tag is present in every page's
real built HTML, and `/stats` clearly explains where to see real
traffic data.

## Phase 5 — Source + Signal filter UI

**What:** client-side only, no new route. Add `data-source` and
`data-interest-tier` attributes to each card in `DigestList.astro`
(tier bucketed from `interest_score`: <6 = Notable, 6-7.9 =
Recommended, 8+ = Must-Read). Add a filter-bar component with buttons
for all 4 real sources (`hn`/`arxiv`/`github`/`devto`) **plus an
explicit "All" option** — deliberately avoiding the exact bug
confirmed in the-daily-diff's own filter (their Source filter has only
two buttons, HN and GitHub, no "All," which permanently hides their
one arXiv-sourced story once either button is clicked). Plain vanilla
`<script>`, no new dependency. Includes a "no stories match the
selected filters" empty state, matching the-daily-diff's own real
pattern.

**Files touched:** `src/components/DigestList.astro`, new small filter
component/script.

**Done when:** clicking any source or signal-tier button shows only
matching cards; "All" (both axes) shows everything; the empty state
renders correctly when a combination matches nothing.

## Phase 6 — Sitemap

**What:** add `@astrojs/sitemap` to `astro.config.mjs`'s
`integrations` array, following Astro's standard integration pattern.

**Files touched:** `astro.config.mjs`, `package.json`.

**Done when:** a real build produces `dist/sitemap-index.xml` and
`dist/sitemap-0.xml` listing every real route.

## Testing strategy

Phases 1, 3, 5, 6 get real Vitest coverage matching this repo's
existing conventions: pure-logic unit tests where applicable
(`tests/pipeline.test.ts`-style), e2e checks against real `dist/`
output for new/changed rendered markup or routes
(`tests/build-output.test.ts`-style). Phase 2 is verified primarily by
the *existing* e2e suite (`build-output`, `archive-pages`, `rss-feed`,
`stats-page`) continuing to pass unchanged after the Layout migration,
plus one new test for the toggle button/script. Phase 4 has no
meaningful automated test — client-side analytics collection isn't
observable in a static build; verification is a real check that the
script tag exists in built output.

## Error handling / edge cases

- Phase 1: cards without `hn_id` render no discuss link (already the
  default, since the link is conditional).
- Phase 3: zero committed digest data (fresh clone, no pipeline run
  yet) → `/latest.json` returns `[]`, not a 404/error.
- Phase 5: the zero-matches empty state is a real, tested case, not an
  afterthought.

## Out of scope (per the gap analysis's own "explicitly not
recommended" section — not reopened here)

Per-story AI-generated infographic images, PWA/offline support, user
accounts/login or bookmark persistence, adopting a CSS framework,
reopening the custom-domain decision, and multi-axis scoring beyond
`interest_score`.
