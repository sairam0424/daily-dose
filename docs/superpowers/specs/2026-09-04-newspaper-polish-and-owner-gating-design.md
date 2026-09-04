# daily-dose Legacy-Newspaper Polish & Owner-Gated Internals — Design Spec

**Status:** Approved for planning (all decisions confirmed via brainstorming
— clarifying questions answered, logo finalized via visual companion; this
doc formalizes them before `writing-plans`).

## 1. Problem & Goals

Six independent gaps identified by the project owner, each backed by a
targeted `/deep-research` pass (logo/branding, `/stats` access-control,
footer conventions, header/archive UX):

1. The favicon (`public/favicon.svg`) is a generic indigo "dd" monogram
   that doesn't match any of the three real skin palettes — placeholder
   art, not a real identity.
2. `/stats` (real per-run LLM cost data) is fully public — the owner wants
   it visible only to themselves; every other page stays public.
3. The interest-score number (a badge on every card, plus a bar chart on
   `index.astro`/`archive/[date].astro`) is a raw internal curation metric
   with no value to a casual reader.
4. The footer on `index.astro` reads "Curation is AI-scored by default —
   see methodology or cost & stats for details" on every page load — the
   owner wants this gone by default, not hidden-but-still-injected.
5. `.masthead`/`.site-nav` are left-aligned; the owner wants a centered,
   classic-newspaper-masthead feel.
6. `/archive/` is a bare list of `YYYY-MM-DD` links + item counts — no
   preview, no image, no way to jump to a date without opening the index
   first.

**Goals:** ship all six as one coherent "legacy newspaper, new technology"
polish pass, sequenced by priority/effort into 6 independently-shippable
phases (6 PRs), matching this repo's `Branches.md` trunk-based flow.

**Non-goals:** no change to the pipeline/schema/curation logic itself (the
interest score is still computed and stored — only its *public rendering*
changes); no new UI framework; no real user-account system (the `/stats`
gate is a single shared owner secret, not multi-user auth).

## 2. Global Decisions (confirmed during brainstorming)

- **Spec/plan structure:** one spec, six phases, six PRs — no splitting
  into multiple specs.
- **`/stats` auth mechanism:** HTTP Basic Auth via Astro middleware,
  checked against a Vercel environment variable. No session, no cookie, no
  login page — the simplest mechanism that is still real access control
  (see Phase 5; `/deep-research` confirmed Vercel's own platform-level
  Deployment Protection cannot be scoped to a single route on any plan
  tier, so this must be application-level, not platform-level).
- **Header centering scope:** center everything — title, tagline, AND the
  nav row (not just the title, per `/deep-research`'s finding that real
  newspaper sites are inconsistent on this; it's a deliberate identity
  choice here, accepted knowingly against NN/g's left-alignment usability
  data).
- **Day-navigation control:** a calendar/date-picker widget in the header
  (not a prev/next-only pair), informed by archive-digitization patterns
  (LOC Chronicling America's calendar view).
- **Logo — finalized via visual companion, 4 rounds of concepts:** the
  "sunrise/dawn glyph" mark (round-1 concept C), **borderless on both
  skins** (the newspaper-light variant's original 1px tile ring was
  compared side-by-side and rejected in favor of matching the dev skin's
  flat, border-free tile).
- **Score-hiding boundary:** raw internal metrics (interest score number,
  the score chart) move behind the owner-only `/stats` gate; the public
  site keeps only the *already-existing* tier-driven visual weight
  (border thickness/color via `[data-interest-tier]`, unchanged) — this is
  the one design principle threading Phases 2 and 5 together.

## 3. Phase 1 — Footer Rewrite (Effort: S)

**Files:** `src/pages/index.astro`, `src/pages/stats.astro`.

**Current state** (`index.astro:53-58`):
```astro
<footer class="site-footer">
  <p>
    Curation is AI-scored by default — see <a href="/methodology">methodology</a> or
    <a href="/stats">cost &amp; stats</a> for details.
  </p>
</footer>
```

**New state:** drop the per-page AI-disclosure sentence. Per
`/deep-research`'s footer findings, no site in this category (tdd.cat,
Console.dev, Hacker Newsletter, Changelog.com) runs a per-page AI-disclosure
banner — disclosure lives on a dedicated page instead. This does **not**
violate `SOUL.md`'s AI-transparency non-negotiable (checked directly): that
non-negotiable requires a reader be able to tell "without digging" — a
stable, always-present nav link to `/methodology` (already on every page's
`<nav class="site-nav">`) satisfies that exactly as well as a footer
sentence, and `/methodology` itself is unchanged and keeps its full,
honest disclosure prose.

Replace with a minimal colophon, matching the category convention (tdd.cat:
GitHub link + Stats + RSS + copyright):

```astro
<footer class="site-footer">
  <p>
    <a href="/rss.xml">RSS</a> · © {new Date().getFullYear()}
  </p>
</footer>
```

Since `/stats` becomes owner-only in Phase 5, the footer must **not** link
to it publicly (a public link to a Basic-Auth-gated page is a broken
promise to readers, not a feature) — drop the `/stats` link from
`index.astro`'s footer (shown above). `stats.astro`'s own footer never
linked to itself in the first place (confirmed — it only had prose); its
"Scope: real per-run LLM cost only..." paragraph stays as-is, since it's
on the page itself, for the owner's own eyes, and correctly explains scope
to the one person who'll read it. (`stats.astro`'s nav link removal is
handled separately, in Phase 5 — see that phase's note.)

**Test:** update `tests/build-output.test.ts`'s existing footer-content
assertion (search for "AI-scored" — it currently asserts this string is
present; invert it to assert absence) and add one new assertion that the
footer contains an RSS link and a copyright year, no `/stats` link.

**Done when:** `npm test` green, footer sentence gone from `index.astro`,
no `/stats` link in any public footer, `/methodology` still reachable from
nav on every page (unchanged).

## 4. Phase 2 — Hide Interest Scores Publicly (Effort: S)

**Files:** `src/components/StoryCard.astro`, `src/pages/index.astro`,
`src/pages/archive/[date].astro`. (`src/pages/stats.astro` gains the moved
chart in Phase 5, once it's actually gated — seePhase 5's sequencing note.)

**Current state:**
- `StoryCard.astro:38-40`: `<span class="score-badge score-badge-{tier}">{entry.data.interest_score.toFixed(1)}</span>` — a numeric badge on every card.
- `index.astro:42-43` and `archive/[date].astro:62-63`: a `<h2>Interest scores</h2>` heading + `<DigestChart labels={chartLabels} scores={chartScores} />` bar chart.

**New state:**
- Remove the `.score-badge` `<span>` (and its 3 tier-color CSS rules —
  `.score-badge-must-read`/`-recommended`/`-notable`) from `StoryCard.astro`
  entirely. **Do not touch** `interestTier(entry.data.interest_score)` or
  the `[data-interest-tier]` attribute on `<li class="story-card">` — the
  tier computation and the border-weight/color visual hierarchy it drives
  (`must-read` = 3px accent border, `recommended` = 2px rule border,
  `notable` = unstyled) stay exactly as-is. This is the one place a reader
  still sees the *effect* of scoring, just not the *number*.
- Remove the `<h2>Interest scores</h2>` + `<DigestChart>` block from both
  `index.astro` and `archive/[date].astro`. Leave `DigestChart.astro`
  itself untouched — it gets a new caller in Phase 5 (`stats.astro`).
- `entry.data.interest_score` stays in the schema, the pipeline, and every
  digest JSON file, completely unchanged — this phase is presentation-only.

**Test:** update `tests/build-output.test.ts` — remove/invert any
assertion that expects `.score-badge` or `<canvas id="score-chart">` on
`index.astro`'s or an archive date page's rendered HTML; add an assertion
that `[data-interest-tier]` and its border CSS are still present (proves
the tier system survived even though its numeric readout didn't).

**Done when:** `npm test` green; a real `npm run build` + manual check
confirms no numeric score or chart renders on `/` or `/archive/{date}/`,
but must-read cards still show their thicker accent border.

## 5. Phase 3 — Header Centering (Effort: S)

**File:** `src/layouts/Layout.astro` (the shared `.masthead`/`.site-nav`
CSS — this is the one styling change that benefits every page for free,
since header/footer markup is duplicated per-page but the CSS is global).

**Current state** (`Layout.astro:106-114`):
```css
.masthead {
  padding: 2rem 1.5rem 1rem;
  border-bottom: 1px solid var(--rule);
}
.site-nav {
  display: flex;
  gap: 1rem;
}
```
No `text-align`/`justify-content` anywhere in `.masthead`, `.site-nav`,
`.masthead h1`, or `.tagline` — everything defaults to left/block-start.

**New state:**
```css
.masthead {
  padding: 2rem 1.5rem 1rem;
  border-bottom: 1px solid var(--rule);
  text-align: center;
}
.site-nav {
  display: flex;
  justify-content: center;
  gap: 1rem;
}
```
`text-align: center` on `.masthead` is sufficient for `<h1>`/`.tagline`
(inline-level content inherits it) — no per-element override needed.
`justify-content: center` on the flex `.site-nav` centers the nav links
row. The existing mobile `@media (max-width: 480px)` wrap/padding-right
rule (`Layout.astro:124-130`, added to keep the nav from colliding with the
fixed-position `PreferenceControls`) is unaffected by centering and stays
as-is — verify manually at 375px that centered-and-wrapped still clears the
preference controls (it should; that rule reserves right-hand space
regardless of alignment).

**Test:** add one assertion to `tests/build-output.test.ts` asserting
`.masthead { text-align: center }` and `.site-nav { justify-content:
center }` appear in the rendered page's CSS (matching this file's existing
`readAllPageCss` pattern).

**Done when:** `npm test` green; manual Playwright check across all 5 page
types (`/`, `/archive/`, `/archive/{date}/`, `/stats`, `/methodology`) in
both skins confirms the masthead reads as centered and the mobile
nav-overlap fix (PR #45) still holds at 375px.

## 6. Phase 4 — New Logo (Effort: M)

**Files:** `public/favicon.svg` (rewrite), `public/og-image.png`
(regenerate), `src/layouts/Layout.astro` or per-page `<header>` markup
(add the mark next to the wordmark at masthead scale — exact insertion
point TBD at implementation time, likely a new small inline `<svg>` or a
shared `Logo.astro` component to avoid duplicating the mark's path data
across 5 page files).

**Finalized design** (locked in via the visual-companion process — 4
rounds, 27 concepts total, this one chosen and refined):

A sunrise/dawn glyph — a filled circle (the sun) sitting on a horizontal
line (the horizon), with 3 short rays above it (1 vertical, 2 diagonal) —
built from `<circle>`/`<path>` only, no `<text>`, no font dependency,
`viewBox="0 0 32 32"`.

**Dev skin (dark) — favicon**, final, unchanged from the comparison round:
```svg
<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <rect width="32" height="32" rx="7" fill="#14141a"/>
  <circle cx="16" cy="20" r="7" fill="#f5a623"/>
  <path d="M4 20h24M9 15l2 2M23 15l-2 2M16 9v4" stroke="#f5a623" stroke-width="1.6" stroke-linecap="round"/>
</svg>
```

**Newspaper skin (light) — favicon**, final, borderless (the tile's 1px
stroke ring from the original round-1 sketch was explicitly compared
against a borderless version and rejected):
```svg
<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <rect width="32" height="32" rx="7" fill="#f8f4e8"/>
  <circle cx="16" cy="20" r="7" fill="#7a2618"/>
  <path d="M4 20h24M9 15l2 2M23 15l-2 2M16 9v4" stroke="#7a2618" stroke-width="1.6" stroke-linecap="round"/>
</svg>
```

**Newspaper skin (dark) — favicon**, mechanical extension of the same
borderless rule onto the third palette (not a new design decision — same
shape, same rule, different tokens):
```svg
<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <rect width="32" height="32" rx="7" fill="#201d16"/>
  <circle cx="16" cy="20" r="7" fill="#c99356"/>
  <path d="M4 20h24M9 15l2 2M23 15l-2 2M16 9v4" stroke="#c99356" stroke-width="1.6" stroke-linecap="round"/>
</svg>
```

**`public/favicon.svg` — single file, all three palettes via
`prefers-color-scheme` (confirmed by `/deep-research` as a real,
Firefox/Chromium-supported technique):** since the site's actual skin
choice is a `localStorage`-driven `data-skin`/`data-theme` attribute, not
the OS-level `prefers-color-scheme` media feature the favicon spec
supports, a single adaptive favicon can only reliably track OS light/dark,
**not** the in-page dev/newspaper skin toggle. Ship `favicon.svg` using
`prefers-color-scheme` for light/dark (covering the common case:
newspaper-light for OS-light, newspaper-dark for OS-dark) as a reasonable
default, and accept that a visitor who manually toggles to the dev skin
sees a favicon that doesn't repaint to match (browser favicons cannot
observe in-page JS state) — a known, documented limitation, not a bug to
chase further.

**Masthead pairing** (from the finalized concept card): dev skin sets
`daily-dose` lowercase in Space Grotesk, with the hyphen in `--accent`;
newspaper skin sets `daily dose` in Fraunces with `dose` italicized in
`--accent`. Exact markup/insertion point is an implementation-time call
(new `Logo.astro` vs. inline per page) — not a design decision this spec
needs to lock further.

**`public/og-image.png`:** regenerate following the existing convention
(`decisions.md`'s 2026-09-03 log entry — Playwright-screenshotted from a
temporary, non-shipped HTML template at exactly 1200×630, committed as a
static file, no new runtime dependency) with the new mark + wordmark
lockup in place of the old generic favicon.

**Test:** `tests/build-output.test.ts` — assert `public/favicon.svg`
(post-build, in `dist/`) contains the new mark's structural signature
(e.g. a `<circle>` with `r="7"`) instead of the old `dd` monogram text,
and that the newspaper-light variant's `<rect>` has no `stroke` attribute
(regression guard for the borderless decision).

**Done when:** `npm test` green; real `npm run build` confirms
`dist/favicon.svg` and `dist/og-image.png` exist and render correctly in
both a real browser tab (favicon) and a social-preview validator (OG
image).

## 7. Phase 5 — Gate `/stats` to Owner-Only (Effort: M) — publish-adjacent

**Files:** `astro.config.mjs`, `package.json` (new dependency), new
`src/middleware.ts`, `src/pages/stats.astro`.

This phase touches the deployment/rendering model, not the pipeline or
schema — it is **not** on `CLAUDE.md`'s named publish-path list
(`scripts/pipeline.ts`, `llmCuration.ts`, `curation.ts`, `costTracking.ts`,
`digestSchema.ts`), but it does add a new runtime dependency and a new
security-relevant code path, so it gets the same deliberateness.

**Confirmed by `/deep-research` (verified against live, current Vercel
docs):** Vercel's Deployment Protection (Password Protection / Vercel
Authentication / Trusted IPs) cannot be scoped to a single path/route on
**any** plan tier — only to whole deployments/domains. Worse for this
project specifically: Password Protection isn't available on Hobby at all
without a $150/mo Pro add-on; free Vercel Authentication on Hobby
explicitly excludes the production domain. Platform-level gating is
therefore not an option regardless of budget — the fix must be
application-level.

**Mechanism (confirmed):**

1. Add the `@astrojs/vercel` adapter (`npm install @astrojs/vercel`) —
   required for any on-demand route on Vercel; `output: 'static'` in
   `astro.config.mjs` stays unchanged (Astro's hybrid pattern: the site
   stays static by default, individual routes opt out):
   ```js
   import { defineConfig } from 'astro/config';
   import sitemap from '@astrojs/sitemap';
   import vercel from '@astrojs/vercel';

   export default defineConfig({
     output: 'static',
     adapter: vercel(),
     site: 'https://daily-dose-hazel-delta.vercel.app',
     integrations: [sitemap()],
   });
   ```
2. `src/pages/stats.astro` gains `export const prerender = false;` at the
   top of its frontmatter — this is the *only* route that stops being
   static; every other page is unaffected.
3. New `src/middleware.ts` (Astro's `onRequest` middleware only executes
   per-request for non-prerendered routes — confirmed by `/deep-research`
   as the mechanism that makes this actually work, not a coincidence):
   checks `Authorization: Basic ...` against a `STATS_PASSWORD` (or
   similarly named) Vercel environment variable; a missing/wrong header
   gets a `401` with a `WWW-Authenticate: Basic` response header (the
   standard way to trigger the browser's native credential prompt); scope
   the middleware's check to `context.url.pathname === '/stats'` only, so
   it never touches any other (static) route.
4. **Do not** attempt to use Vercel's own Routing Middleware/`proxy`
   feature for this — `/deep-research` confirmed it is explicitly
   incompatible with Astro (Astro owns its own routing/middleware layer).

**Open implementation risk to verify empirically, not assume:**
`stats.astro`'s current data read (`readFile(resolve(process.cwd(),
'src/data/stats.jsonl'), 'utf-8')`, a dynamic filesystem path, not a
static import) currently runs at **build time** under `output: 'static'`.
Once `prerender = false` makes this route render **per-request** inside a
Vercel serverless function, this same code runs at **request time** inside
that function's filesystem sandbox — and Vercel's bundler does not
automatically know to include `src/data/stats.jsonl` in the function
bundle just because a dynamic `readFile` call references it. **Verify this
against a real preview deployment before merging** — if the file is
missing at runtime, the fix is either an explicit `@astrojs/vercel`
`includeFiles` config entry for `src/data/stats.jsonl`, or switching the
read to a statically-analyzable import Vite can trace (e.g. `import
statsRaw from '../data/stats.jsonl?raw'`). Do not guess which is needed —
deploy a preview and check.

**Also required here (missed in Phase 1's footer-only pass — a public nav
link to a Basic-Auth-gated page is the same "broken promise" problem, just
in `<nav>` instead of `<footer>`):** remove the `<a href="/stats">Cost &amp;
stats &rarr;</a>` entry from `index.astro`'s `<nav class="site-nav">`
(`index.astro:27` — the only page whose nav links to `/stats` at all;
confirmed no other page's nav does). Do this in this phase, alongside the
gating itself landing, not earlier — removing it in Phase 1 would drop the
only way to reach `/stats` before it's actually gated.

**Interaction with Phase 2:** the interest-score chart (`DigestChart`,
removed from public pages in Phase 2) moves into `stats.astro` here — the
one place it now belongs, alongside the cost tables, for the owner's own
eyes. Add `<h2 class="section-heading">Interest scores</h2>` +
`<DigestChart labels={...} scores={...} />` back, sourced the same way
`index.astro` used to (all entries from the latest digest, or — since this
page previously had no notion of "latest digest" — the full historical set
if that reads better; an implementation-time call, not a design fork).

**Test:** `tests/` cannot exercise real HTTP Basic Auth against a live
Vercel function (no automated test makes a real network call, per this
repo's convention) — add a focused unit test for the middleware's pure
comparison logic if it's extracted as a testable function (e.g.
`isValidStatsAuth(header: string | null, expectedPassword: string):
boolean`), and rely on manual verification (curl with/without credentials
against a real preview deployment) for the end-to-end behavior, exactly
the way `daily-pipeline.yml`'s real cron behavior is verified manually
rather than unit-tested.

**Done when:** `npm test` + `npm run build` green; a real Vercel preview
deployment confirms `/stats` returns `401` with no credentials and `200`
with the correct Basic Auth credentials; every other route still serves
as a static file (confirmed via response headers / `dist/` output
containing prerendered HTML for every other page).

## 8. Phase 6 — Richer Archive (Effort: L)

**Files:** `src/pages/archive/index.astro`, `src/pages/archive/[date].astro`
(minor — adds the calendar control), new `src/components/DigestPreviewCard.astro`,
`src/layouts/Layout.astro` (calendar control placement in the masthead).

**Part A — preview cards on `/archive/`:**

Replace the current bare `<li class="date-card">` (date string + item
count, `archive/index.astro:26-34`) with a `DigestPreviewCard.astro` per
date, showing: the date, the day's **lead story's** title + its `why_read`
excerpt (truncated) + its `image_url` if present (reuse the same
`has-image`/`lead-story` selection logic `DigestList`/`StoryCard` already
use — do not reinvent "which story is the lead" a second time), and the
item count. This directly answers the "you are just showing the link"
complaint — a reader can now tell what a given day's edition contained
without a click-through.

**Part B — calendar/date-picker in the header:**

A new control (native `<input type="date">` with a `min`/`max` bound to
the earliest/latest real digest date, or a custom small calendar
component if the native picker's date-availability marking is judged too
weak — implementation-time call) added to the masthead area, available on
**every page** (not archive-only), letting a reader jump directly to any
date's digest without first opening `/archive/`. Needs the full list of
valid dates (`dateGroups.map(g => g.date)`, already computed by every page
that calls `groupEntriesByDate` — expose it via a small shared helper or a
build-time-generated JSON if the control needs client-side date validation
beyond what a native `<input type="date">`'s `min`/`max` alone provides).

**Test:** new `tests/archive-preview-cards.test.ts` (mirroring existing
`tests/archive-pages.test.ts` conventions) asserting each date's card
renders a real title/excerpt/image (or its absence, for a lead story with
no `image_url`) from real committed digest data, not a placeholder. A
build-output assertion confirming the calendar control's markup exists on
at least `/` and one archive page.

**Done when:** `npm test` + `npm run build` green; manual check confirms
`/archive/` shows real per-day previews (not bare links) and the calendar
control successfully navigates to a real past date from the homepage.

## 9. Sequencing

Six branches, six PRs, in this order (matches the priority/effort table
already shared with the owner): Phase 1 → Phase 2 → Phase 3 → Phase 4 →
Phase 5 → Phase 6. Phases 1-3 are independent of each other and could ship
in either order; the fixed sequence is kept only because it matches the
already-communicated priority list, not because of a hard dependency.
Phase 5 must ship before Phase 2's chart-relocation is *complete* in
spirit (the chart has nowhere permanent to live until `/stats` exists to
receive it) — Phase 2 removes the chart from public pages regardless of
Phase 5's status (that part has no dependency), but the "chart moves into
`/stats`" half of the work is described in Phase 5, not duplicated in
Phase 2, to avoid two phases touching `stats.astro` for the same reason.

## 10. Testing Strategy (repo-wide conventions applied per phase)

Every phase: `npm test` (Vitest, extend `tests/build-output.test.ts` and
sibling files following each file's existing pattern) + `npm run build`
green, per this repo's CI gate. Phase 5 additionally needs a real Vercel
preview-deployment check (the one place this spec touches a genuinely
live, non-mockable integration, matching how `daily-pipeline.yml`'s
schedule trigger was verified in this project's history). No phase touches
`scripts/pipeline.ts`'s core fetch functions, `llmCuration.ts`, or
`digestSchema.ts` — plan-mode's publish-path gate is satisfied by this
spec's own review, not re-triggered per phase.

## 11. Risks / Non-Goals Restated

- The favicon's `prefers-color-scheme` adaptation tracks OS light/dark,
  not the in-page skin toggle — accepted limitation (Phase 4).
- HTTP Basic Auth has no logout, no rate-limiting, no audit log — a
  correctly-scoped, real access control for a single owner-only page, not
  a general auth system; acceptable for this project's actual threat model
  (Phase 5).
- The `stats.jsonl` runtime-file-access risk (Phase 5) is flagged, not
  pre-solved — resolve it against a real deployment, not by guessing.
- No phase changes what data the pipeline computes or stores — every
  "hidden" or "moved" value is a rendering change only.
