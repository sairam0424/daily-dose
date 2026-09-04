# daily-dose Legacy-Newspaper Polish & Owner-Gated Internals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship six independently-shippable polish items — footer rewrite,
hiding interest scores publicly, header centering, a new dual-skin logo,
gating `/stats` to owner-only, and richer per-story archive previews with
a date-picker — each as its own branch/PR.

**Architecture:** No pipeline/schema/curation changes anywhere in this
plan — every task is presentation-layer (Astro components/pages/CSS) or,
for Phase 5 only, a new deployment-adapter + middleware layer that Astro
itself documents as its standard hybrid-rendering escape hatch.

**Tech Stack:** Astro 5.16.5 (`output: 'static'`, gaining `@astrojs/vercel`
in Phase 5 only), Vitest 3, TypeScript, no new UI framework.

**Spec:** `docs/superpowers/specs/2026-09-04-newspaper-polish-and-owner-gating-design.md`

## Global Constraints

- No change to `scripts/pipeline.ts`, `src/lib/llmCuration.ts`,
  `src/lib/curation.ts`, `src/lib/costTracking.ts`, or
  `src/lib/digestSchema.ts` anywhere in this plan (confirmed in the spec —
  none of the 6 phases touch the publish path).
- `entry.data.interest_score` and `interestTier()`/`[data-interest-tier]`
  border-weight CSS are never removed — only the public *numeric readout*
  and the *chart* are removed/relocated (Phase 2).
- Every task: `npm test` and `npm run build` green before commit, matching
  `.github/workflows/ci.yml`'s real gate.
- No `Co-Authored-By` trailer on any commit (no `.claude/settings.json`
  `attribution.commit` override in this repo).
- One branch per phase, one PR per phase, squash-merged in the order
  given below (Branches.md's trunk-based flow) — do not combine phases
  into one branch even though this document lists them together.

---

## Phase 1 — Footer Rewrite

**Branch:** `fix/footer-rewrite`

### Task 1: Replace the AI-disclosure footer with a minimal colophon

**Files:**
- Modify: `src/pages/index.astro:53-58`
- Test: `tests/build-output.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by later phases (Phase 1 is fully
  self-contained).

**Current state** (`index.astro:53-58`):
```astro
<footer class="site-footer">
  <p>
    Curation is AI-scored by default — see <a href="/methodology">methodology</a> or
    <a href="/stats">cost &amp; stats</a> for details.
  </p>
</footer>
```

- [ ] **Step 1: Write the failing test**

Add to `tests/build-output.test.ts` (inside `describe("dist/index.html build output", ...)`):

```ts
  it("(backlog) footer is a minimal colophon, not the AI-disclosure banner", () => {
    expect(html).not.toContain("Curation is AI-scored by default");
    expect(html).not.toMatch(/<footer[^>]*>[\s\S]*?href="\/stats"[\s\S]*?<\/footer>/);
    const footerMatch = html.match(/<footer[^>]*>([\s\S]*?)<\/footer>/);
    expect(footerMatch, "expected a <footer> on the homepage").toBeTruthy();
    expect(footerMatch![1]).toContain('href="/rss.xml"');
    expect(footerMatch![1]).toMatch(/©\s*\d{4}/);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && npx vitest run tests/build-output.test.ts -t "minimal colophon"`
Expected: FAIL — the current footer still contains "Curation is AI-scored by default" and no `/rss.xml` link.

- [ ] **Step 3: Replace the footer markup**

In `src/pages/index.astro`, replace:
```astro
  <footer class="site-footer">
    <p>
      Curation is AI-scored by default — see <a href="/methodology">methodology</a> or
      <a href="/stats">cost &amp; stats</a> for details.
    </p>
  </footer>
```
with:
```astro
  <footer class="site-footer">
    <p>
      <a href="/rss.xml">RSS</a> · © {new Date().getFullYear()}
    </p>
  </footer>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && npx vitest run tests/build-output.test.ts -t "minimal colophon"`
Expected: PASS

- [ ] **Step 5: Run the full suite and build**

Run: `npm test && npm run build`
Expected: all tests pass (137 existing + 1 new), build clean.

- [ ] **Step 6: Commit**

```bash
git add src/pages/index.astro tests/build-output.test.ts
git commit -m "fix(footer): replace AI-disclosure banner with a minimal colophon

The 'Curation is AI-scored by default' sentence ran on every page load.
Per category-convention research (tdd.cat, Console.dev, Hacker
Newsletter, Changelog.com), none of these sites run a per-page AI-
disclosure banner - disclosure lives on a dedicated page instead. This
does not weaken SOUL.md's AI-transparency non-negotiable: that
non-negotiable requires a reader be able to tell 'without digging',
which the existing, unchanged /methodology nav link already satisfies.
Also drops the now-stale /stats link ahead of Phase 5 gating it."
```

**Done when:** `npm test` and `npm run build` pass; the new test passes;
manual check confirms the homepage footer reads "RSS · © 2026" with no
AI-disclosure sentence.

---

## Phase 2 — Hide Interest Scores Publicly

**Branch:** `fix/hide-interest-scores`

### Task 2: Remove the numeric score badge from story cards

**Files:**
- Modify: `src/components/StoryCard.astro`
- Test: `tests/build-output.test.ts`

**Interfaces:**
- Consumes: `interestTier(entry.data.interest_score)` (unchanged,
  `src/lib/interestTier.ts` — still called, still drives
  `data-interest-tier`).
- Produces: nothing consumed later — the tier attribute and its CSS stay
  exactly as other tasks already depend on them (Phase 6's
  `DigestPreviewCard` will read the same attribute).

**Current state** (`StoryCard.astro`, markup around line 38):
```astro
    <span class={`score-badge score-badge-${tier}`}>
      {entry.data.interest_score.toFixed(1)}
    </span>
```
and CSS (around lines 194-219):
```css
  /* Score/model-ID mono accent: 0.8rem for BOTH skins per spec Section 4
     (identical row) — a flat, unscoped value is correct here, not a gap. */
  .score-badge {
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 0.8rem;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
  }

  .score-badge-must-read {
    background: var(--accent);
    color: var(--accent-ink);
  }

  .score-badge-recommended {
    border: 1px solid var(--accent);
    color: var(--accent);
  }

  /* Uses --rule-soft (softer than the source-badge's --rule border) since
     "notable" is deliberately the least visually emphasized tier. */
  .score-badge-notable {
    border: 1px solid var(--rule-soft);
    color: var(--ink-soft);
  }
```

- [ ] **Step 1: Write the failing test**

Add to `tests/build-output.test.ts`:

```ts
  it("(backlog) does not render a numeric interest-score badge publicly", () => {
    expect(html).not.toContain('class="score-badge');
    const style = readAllPageCss(html);
    expect(style).not.toMatch(/\.score-badge\s*\{/);
  });

  it("(backlog) still renders [data-interest-tier] with its border-weight CSS (tier hierarchy survives)", () => {
    expect(html).toMatch(/data-interest-tier="(must-read|recommended|notable)"/);
    const style = readAllPageCss(html);
    expect(style).toMatch(/\[data-interest-tier=['"]?must-read['"]?\]\s*\{[^}]*border/);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && npx vitest run tests/build-output.test.ts -t "numeric interest-score badge"`
Expected: FAIL — `.score-badge` is currently present.

- [ ] **Step 3: Remove the badge markup and its CSS**

In `src/components/StoryCard.astro`, delete the `<span class={\`score-badge score-badge-${tier}\`}>...</span>` block from the template, and delete the `.score-badge`, `.score-badge-must-read`, `.score-badge-recommended`, `.score-badge-notable` rules from the `<style>` block. Leave `const tier = interestTier(entry.data.interest_score);` and every `data-interest-tier={tier}` usage untouched.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && npx vitest run tests/build-output.test.ts -t "interest-score"`
Expected: both new tests PASS.

- [ ] **Step 5: Run the full suite and build**

Run: `npm test && npm run build`

- [ ] **Step 6: Commit**

```bash
git add src/components/StoryCard.astro tests/build-output.test.ts
git commit -m "fix(story-card): remove the public numeric interest-score badge

The raw 0-10 score is an internal curation metric with no value to a
casual reader (third-person view). interestTier()'s bucket computation
and the [data-interest-tier] border-weight visual hierarchy it drives
are untouched - only the numeric readout is gone. The number still
exists in the schema/pipeline/JSON files; it now surfaces only on the
owner-only stats page (Phase 5)."
```

### Task 3: Remove the interest-score chart from public pages, fix the tests that expected it there

**Files:**
- Modify: `src/pages/index.astro:42-43`
- Modify: `src/pages/archive/[date].astro:62-63`
- Modify: `tests/build-output.test.ts` (3 existing tests currently assert the chart IS on `dist/index.html` — they must be updated, not left red)

**Interfaces:**
- Consumes: `DigestChart` component (`src/components/DigestChart.astro`,
  unchanged — `Props { labels: string[]; scores: number[] }`).
- Produces: `chartLabels`/`chartScores` computation is deleted from
  `index.astro` and `archive/[date].astro` — Phase 5's Task 8 will
  recompute an equivalent pair inside `stats.astro` using the same
  `entry.data.title` / `entry.data.interest_score` shape.

**Current state** (`index.astro`, inside `<main>`):
```astro
        <h2 class="section-heading">Interest scores</h2>
        <DigestChart labels={chartLabels} scores={chartScores} />
```
plus the frontmatter computing `chartLabels`/`chartScores` (`index.astro:16-17`).

**Current state** (`archive/[date].astro`, inside `<main>`):
```astro
    <h2 class="section-heading">Interest scores</h2>
    <DigestChart labels={chartLabels} scores={chartScores} />
```
plus its own `chartLabels`/`chartScores` frontmatter (`archive/[date].astro:39-40`).

**Existing tests that currently require the chart on `dist/index.html`**
(all three in `tests/build-output.test.ts`, must change in this task —
otherwise this task leaves CI red):
1. `it("shows evidence the Chart.js island is present in the output", ...)` (around line 77)
2. `it("(regression) bundles DigestChart's script instead of shipping the raw unresolved import", ...)` (around line 105)
3. `it("keeps the score chart canvas present after the redesign (regression check)", ...)` (around line 254)

- [ ] **Step 1: Write the failing test**

Add to `tests/build-output.test.ts`:

```ts
  it("(backlog) does not render the interest-score chart on the homepage", () => {
    expect(html).not.toContain('id="score-chart"');
    expect(html).not.toContain("Interest scores");
  });
```

Add the equivalent to `tests/archive-pages.test.ts` for a date page (mirror that file's existing `readCommittedDates()`/date-page-reading pattern to load one date's `dist/archive/{date}/index.html`, then):

```ts
  it("(backlog) does not render the interest-score chart on an archive date page", () => {
    const dates = readCommittedDates();
    const datePagePath = join(DIST_ARCHIVE_BASE, dates[dates.length - 1], "index.html");
    const dateHtml = readFileSync(datePagePath, "utf-8");
    expect(dateHtml).not.toContain('id="score-chart"');
    expect(dateHtml).not.toContain("Interest scores");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run build && npx vitest run tests/build-output.test.ts tests/archive-pages.test.ts -t "interest-score chart"`
Expected: FAIL — the chart is currently present on both pages.

- [ ] **Step 3: Remove the chart from both pages**

In `src/pages/index.astro`: delete the `chartLabels`/`chartScores` frontmatter lines and the `<h2 class="section-heading">Interest scores</h2>` + `<DigestChart .../>` block; remove the now-unused `import DigestChart from '../components/DigestChart.astro';` import.

In `src/pages/archive/[date].astro`: delete the same three things (frontmatter computation, heading+component block, import).

- [ ] **Step 4: Update the 3 tests that currently expect the chart on index.html**

In `tests/build-output.test.ts`:

Replace test 1 (`"shows evidence the Chart.js island is present in the output"`) and test 2 (`"(regression) bundles DigestChart's script..."`) — both currently assert against `dist/index.html`'s `html` variable — with a single note that these move to Phase 5:

```ts
  // (moved) These two tests asserted the Chart.js island bundled correctly
  // on the homepage. The chart moved to the owner-only /stats page in
  // Phase 5 (see docs/superpowers/plans/2026-09-04-newspaper-polish-and-owner-gating.md)
  // - equivalent coverage is added there against dist/stats/index.html.
```
(Delete both `it(...)` blocks; leave this comment in their place so the history is traceable.)

Replace test 3 (`"keeps the score chart canvas present after the redesign (regression check)"`, around line 254) the same way — delete it, its coverage is superseded by the new `"(backlog) does not render the interest-score chart on the homepage"` test added in Step 1 above (which asserts the opposite, correctly, for the new behavior) plus Phase 5's new stats-page test.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run build && npm test`
Expected: all tests pass — the 2 new "(backlog)" tests pass, the 3 superseded tests are gone (not failing), everything else is unaffected.

- [ ] **Step 6: Commit**

```bash
git add src/pages/index.astro src/pages/archive/\[date\].astro tests/build-output.test.ts tests/archive-pages.test.ts
git commit -m "fix(pages): remove the public interest-score chart

Moves the raw-score chart out of the two public pages that showed it
(homepage, archive date pages). The chart itself (DigestChart.astro) is
untouched - Phase 5 gives it a new, more appropriate home on the
owner-only /stats page. Updates 3 existing tests that asserted the
chart's presence on dist/index.html; their coverage is either superseded
by this task's own new test or deferred to Phase 5's stats-page test."
```

**Done when (Phase 2 overall):** `npm test` and `npm run build` green; a
manual check of `/` and any `/archive/{date}/` confirms no score number
or chart renders, but `must-read`-tier cards still show a visibly
thicker/colored border than `notable`-tier ones.

---

## Phase 3 — Header Centering

**Branch:** `feat/center-masthead`

### Task 4: Center the masthead title, tagline, and nav row

> **Ruling recorded during implementation:** the implementer correctly
> caught that plain `justify-content: center` on `.site-nav` reintroduces
> the exact mobile overlap PR #45 fixed — the `padding-right` reservation
> hack only guarantees safety for a left-packed row (a centered row's
> content sits at its own midpoint regardless of how close that midpoint
> falls to the reserved zone), confirmed empirically at a real 375px
> viewport via Playwright (~30-55px of overlap, even on rows that never
> needed to wrap). Fix: add `justify-content: flex-start` to the existing
> `@media (max-width: 480px) { .site-nav { ... } }` override, so centering
> applies above that breakpoint only. The steps below are updated in
> place to include this.

**Files:**
- Modify: `src/layouts/Layout.astro:106-132` (now includes the mobile
  `@media` block, not just lines 106-114 as originally scoped — see
  ruling above)
- Test: `tests/build-output.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by later phases.

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

- [ ] **Step 1: Write the failing test**

Add to `tests/build-output.test.ts`:

```ts
  it("(backlog) centers the masthead and nav row (legacy-newspaper identity)", () => {
    const style = readAllPageCss(html);
    expect(style).toMatch(/\.masthead\s*\{[^}]*text-align:\s*center/);
    expect(style).toMatch(/\.site-nav\s*\{[^}]*justify-content:\s*center/);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && npx vitest run tests/build-output.test.ts -t "centers the masthead"`
Expected: FAIL — neither rule exists yet.

- [ ] **Step 3: Add the centering rules**

In `src/layouts/Layout.astro`, change:
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
to:
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && npx vitest run tests/build-output.test.ts -t "centers the masthead"`
Expected: PASS.

- [ ] **Step 5: Run the full suite and build, then verify the existing mobile nav-overlap regression test still passes**

Run: `npm test && npm run build`
Expected: all pass, INCLUDING the existing `"(audit fix) wraps the header nav on narrow viewports..."` test (asserts the `@media (max-width: 480px) .site-nav { flex-wrap: wrap; padding-right: ... }` rule) — centering only adds `justify-content`, it does not remove or conflict with `flex-wrap`/`padding-right`.

- [ ] **Step 6: Manual verification at mobile width**

Start the dev server (`npm run dev`), open the homepage at a 375px viewport in both skins, and confirm: the masthead title/tagline/nav all read as centered, and the nav row still wraps before it would render under the fixed `PreferenceControls` (the same check PR #45 originally verified — centering must not reintroduce that overlap).

- [ ] **Step 7: Commit**

```bash
git add src/layouts/Layout.astro tests/build-output.test.ts
git commit -m "feat(layout): center the masthead title, tagline, and nav row

Moves from a left-aligned, app-header-style masthead to a centered,
classic-print-masthead layout, matching the project's 'legacy newspaper,
new technology' identity. Deep-research on real newspaper sites found
this is a genuine usability trade-off (NN/g's own data favors left-
aligned logos for one-click home navigation) - accepted knowingly as a
deliberate identity choice, not a usability oversight."
```

**Done when:** `npm test` and `npm run build` pass; manual check across
all 5 page types in both skins confirms a centered masthead with no
mobile nav-overlap regression.

---

## Phase 4 — New Logo

**Branch:** `feat/new-logo`

### Task 5: Replace the placeholder favicon with the finalized sunrise-glyph mark

**Files:**
- Modify: `public/favicon.svg` (full rewrite)
- Test: `tests/build-output.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `public/favicon.svg`'s new `<circle>`/`<path>` structure is
  asserted directly by this task's test — no other task depends on its
  exact markup.

**Current state** (`public/favicon.svg`, full file):
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#4f46e5" />
  <text
    x="16"
    y="21.5"
    text-anchor="middle"
    font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    font-size="14"
    font-weight="700"
    fill="#ffffff"
  >dd</text>
</svg>
```

**New state** — a single file using `prefers-color-scheme` to switch
between the newspaper-light and newspaper-dark palettes (the OS-level
signal the favicon spec can actually observe), with the dev-skin palette
NOT represented here (favicons cannot observe the page's in-app
`data-skin` toggle — this is Phase 4's one accepted, documented
limitation from the spec). Use the finalized, borderless mark:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <style>
    .tile { fill: #f8f4e8; }
    .mark { fill: #7a2618; stroke: #7a2618; }
    @media (prefers-color-scheme: dark) {
      .tile { fill: #201d16; }
      .mark { fill: #c99356; stroke: #c99356; }
    }
  </style>
  <rect width="32" height="32" rx="7" class="tile" />
  <circle cx="16" cy="20" r="7" class="mark" stroke="none" />
  <path d="M4 20h24M9 15l2 2M23 15l-2 2M16 9v4" class="mark" fill="none" stroke-width="1.6" stroke-linecap="round" />
</svg>
```

- [ ] **Step 1: Write the failing test**

Add to `tests/build-output.test.ts` (a new top-level `describe`, since
this reads a `public/` asset copied verbatim into `dist/`, not
`dist/index.html`):

```ts
describe("dist/favicon.svg", () => {
  it("(backlog) is the new sunrise-glyph mark, not the old 'dd' monogram", () => {
    const svgPath = join(DIST_DIR, "favicon.svg");
    expect(existsSync(svgPath), `expected ${svgPath} to exist`).toBe(true);
    const svg = readFileSync(svgPath, "utf-8");
    expect(svg).not.toContain(">dd<");
    expect(svg).toContain('r="7"');
    expect(svg).toMatch(/prefers-color-scheme:\s*dark/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && npx vitest run tests/build-output.test.ts -t "sunrise-glyph mark"`
Expected: FAIL — `dist/favicon.svg` still contains the old `dd` monogram.

- [ ] **Step 3: Replace `public/favicon.svg`'s content**

Overwrite the full file with the "New state" SVG above.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && npx vitest run tests/build-output.test.ts -t "sunrise-glyph mark"`
Expected: PASS.

- [ ] **Step 5: Manual verification in a real browser**

Run `npm run dev`, open the homepage, and confirm the browser tab favicon
renders the sunrise glyph (not the old blue square). Toggle the OS/browser
color scheme (or use devtools' rendering emulation for
`prefers-color-scheme`) and confirm the favicon's tile/mark colors swap
between the newspaper-light and newspaper-dark palettes.

- [ ] **Step 6: Commit**

```bash
git add public/favicon.svg tests/build-output.test.ts
git commit -m "feat(brand): replace the placeholder favicon with the finalized logo

The old favicon.svg was a generic indigo #4f46e5 'dd' monogram matching
none of the three real skin palettes. Replaces it with the sunrise-glyph
mark chosen via a 4-round, 27-concept visual-companion brainstorming
session, using prefers-color-scheme to adapt between the newspaper-
light and newspaper-dark palettes (the OS-level signal a favicon can
actually observe - it cannot see the in-page dev/newspaper skin toggle,
a documented, accepted limitation)."
```

### Task 6: Add the mark to the masthead, next to the wordmark, on every page

**Files:**
- Create: `src/components/Logo.astro`
- Modify: `src/pages/index.astro`, `src/pages/archive/index.astro`, `src/pages/archive/[date].astro`, `src/pages/stats.astro`, `src/pages/methodology.astro` (each gains one `<Logo />` usage inside its `<header class="masthead">`, immediately before its `<h1>`)
- Test: `tests/build-output.test.ts`

**Interfaces:**
- Consumes: the three palette tokens already defined in
  `Layout.astro`'s global `:root`/`[data-skin='dev']`/
  `[data-skin='newspaper'][data-theme='dark']` blocks (component reads
  them via `currentColor`/`var(--accent)`, does not redefine them).
- Produces: `<Logo />`, a zero-prop Astro component, importable by any
  page — Phase 6 does not need it, but any future page gains the mark for
  free by importing it the same way.

**Design (mirrors `PreferenceControls.astro`'s existing
render-all-variants-then-CSS-toggle pattern for `.icon-sun`/`.icon-moon`,
used here for 3 variants instead of 2):**

- [ ] **Step 1: Write the failing test**

Add to `tests/build-output.test.ts`:

```ts
  it("(backlog) renders the Logo mark in the masthead, with a skin-appropriate variant for each of the 3 palette states", () => {
    expect(html).toContain('class="logo-mark logo-mark-dev"');
    expect(html).toContain('class="logo-mark logo-mark-newspaper-light"');
    expect(html).toContain('class="logo-mark logo-mark-newspaper-dark"');
    const style = readAllPageCss(html);
    expect(style).toMatch(/\.logo-mark-newspaper-light\s*\{[^}]*display:\s*block/);
    expect(style).toMatch(/\.logo-mark-newspaper-dark\s*\{[^}]*display:\s*none/);
    expect(style).toMatch(/\[data-skin=['"]?dev['"]?\][^{]*\.logo-mark-dev\s*\{[^}]*display:\s*block/);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && npx vitest run tests/build-output.test.ts -t "Logo mark in the masthead"`
Expected: FAIL — `Logo.astro` does not exist yet.

- [ ] **Step 3: Create `src/components/Logo.astro`**

```astro
---
---

<svg class="logo-mark logo-mark-dev" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
  <circle cx="16" cy="20" r="7" fill="#f5a623" />
  <path d="M4 20h24M9 15l2 2M23 15l-2 2M16 9v4" stroke="#f5a623" stroke-width="1.6" stroke-linecap="round" fill="none" />
</svg>
<svg class="logo-mark logo-mark-newspaper-light" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
  <circle cx="16" cy="20" r="7" fill="#7a2618" />
  <path d="M4 20h24M9 15l2 2M23 15l-2 2M16 9v4" stroke="#7a2618" stroke-width="1.6" stroke-linecap="round" fill="none" />
</svg>
<svg class="logo-mark logo-mark-newspaper-dark" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
  <circle cx="16" cy="20" r="7" fill="#c99356" />
  <path d="M4 20h24M9 15l2 2M23 15l-2 2M16 9v4" stroke="#c99356" stroke-width="1.6" stroke-linecap="round" fill="none" />
</svg>

<style>
  .logo-mark {
    display: none;
    vertical-align: middle;
    margin-right: 0.4rem;
  }

  /* Default (no [data-skin] override matched yet) = newspaper-light,
     mirroring Layout.astro's own `:root, [data-skin='newspaper']`
     default-light token block. */
  .logo-mark-newspaper-light {
    display: block;
  }

  :global([data-skin='dev']) .logo-mark-newspaper-light {
    display: none;
  }

  :global([data-skin='dev']) .logo-mark-dev {
    display: block;
  }

  :global([data-skin='newspaper'][data-theme='dark']) .logo-mark-newspaper-light {
    display: none;
  }

  :global([data-skin='newspaper'][data-theme='dark']) .logo-mark-newspaper-dark {
    display: block;
  }
</style>
```

- [ ] **Step 4: Wire `<Logo />` into every page's masthead**

In each of `src/pages/index.astro`, `src/pages/archive/index.astro`,
`src/pages/archive/[date].astro`, `src/pages/stats.astro`,
`src/pages/methodology.astro`: add `import Logo from '../components/Logo.astro';`
(adjust relative path for the two files under `archive/`) and change
```astro
    <h1>...</h1>
```
to
```astro
    <h1><Logo /> ...</h1>
```
(preserving each page's existing `<h1>` text/expression exactly — only
prepend `<Logo />` inside the same `<h1>` tag, so the mark sits inline
with the wordmark at masthead scale).

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run build && npx vitest run tests/build-output.test.ts -t "Logo mark in the masthead"`
Expected: PASS.

- [ ] **Step 6: Run the full suite and build**

Run: `npm test && npm run build`

- [ ] **Step 7: Manual verification**

`npm run dev`, check all 5 page types in both skins (dev / newspaper-light
/ newspaper-dark) — confirm exactly one mark variant renders per state,
correctly colored, sitting inline before each page's `<h1>` text.

- [ ] **Step 8: Regenerate `public/og-image.png`**

Manual step (matches the existing convention from `decisions.md`'s
2026-09-03 log entry — no code, no test, a committed static asset):
screenshot a temporary, non-shipped 1200×630 HTML template showing the new
mark + "daily-dose" wordmark lockup via Playwright MCP, save it over
`public/og-image.png`, and verify via `npm run build` that
`dist/og-image.png` is exactly 1200×630 and matches the new logo.

- [ ] **Step 9: Commit**

```bash
git add src/components/Logo.astro src/pages/index.astro src/pages/archive/index.astro src/pages/archive/\[date\].astro src/pages/stats.astro src/pages/methodology.astro public/og-image.png tests/build-output.test.ts
git commit -m "feat(brand): add the logo mark to every page's masthead

New Logo.astro renders all 3 palette variants of the sunrise-glyph mark
(mirroring PreferenceControls.astro's existing render-all-then-CSS-
toggle pattern for its sun/moon icons) and is wired into all 5 pages'
<h1> mastheads. Regenerates og-image.png with the new mark+wordmark
lockup, following the existing Playwright-screenshot convention (no new
runtime dependency)."
```

**Done when:** `npm test` and `npm run build` pass; manual check confirms
the mark renders correctly on every page in every skin/theme combination
and the favicon/OG image both reflect the new brand.

---

## Phase 5 — Gate `/stats` to Owner-Only

**Branch:** `feat/gate-stats-owner-only`

### Task 7: Add the Vercel adapter and switch `/stats` to on-demand rendering

**Files:**
- Modify: `astro.config.mjs`
- Modify: `package.json` (new dependency)
- Modify: `src/pages/stats.astro` (add `export const prerender = false;`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `stats.astro` becomes the only non-prerendered route in the
  site — Task 8's middleware relies on this being true (middleware's
  `onRequest` only runs per-request for non-prerendered routes).

- [ ] **Step 1: Install the adapter**

```bash
npm install @astrojs/vercel
```

- [ ] **Step 2: Update `astro.config.mjs`**

Change:
```js
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  output: 'static',
  site: 'https://daily-dose-hazel-delta.vercel.app',
  integrations: [sitemap()],
});
```
to:
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
(`output: 'static'` stays — this is Astro's documented hybrid pattern:
the site stays static by default, one route opts out.)

- [ ] **Step 3: Mark `/stats` as on-demand**

At the very top of `src/pages/stats.astro`'s frontmatter (before the
existing `import { readFile } from 'node:fs/promises';` line), add:
```ts
export const prerender = false;
```

- [ ] **Step 4: Run the full suite and build**

Run: `npm test && npm run build`
Expected: green. `npm run build`'s output should now show `/stats` built
as a server-rendered route (Astro's build log distinguishes prerendered
pages from on-demand ones — confirm `/stats` is NOT listed as a static
`.html` file the way `/`, `/archive/`, `/methodology` still are).

- [ ] **Step 5: Deploy a real preview and check the critical open risk**

Push this branch, let Vercel build a real preview deployment (per this
repo's git-integrated auto-deploy), then visit the preview's `/stats` URL.
**This is the spec's flagged open risk — verify it here, do not assume:**
`stats.astro`'s `readFile(resolve(process.cwd(), 'src/data/stats.jsonl'),
'utf-8')` call now runs inside a Vercel serverless function at request
time, not at build time. Two possible outcomes:
  - **If the page renders real cost data correctly:** the file was
    bundled automatically (Vercel/Astro traced the dynamic path) — no
    further action needed, proceed to Task 8.
  - **If the page renders with empty/missing stats data (the
    `readStats()` function's `catch { return []; }` silently swallows a
    file-not-found error, so this will look like "no data yet," not a
    crash):** the file was not bundled. Fix by switching the read to a
    statically-analyzable import Vite can trace:
    ```ts
    import statsRaw from '../data/stats.jsonl?raw';
    // replace readStats()'s body with:
    function readStats(): StatsEntry[] {
      return statsRaw
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as StatsEntry);
    }
    ```
    (drop the `async`/`await readFile(...)` plumbing accordingly — a
    `?raw` import is synchronous and resolved at build time regardless of
    the route's own prerender status, which sidesteps the runtime-
    filesystem question entirely). Re-deploy the preview and re-verify.

- [ ] **Step 6: Commit**

```bash
git add astro.config.mjs package.json package-lock.json src/pages/stats.astro
git commit -m "feat(stats): switch /stats to on-demand rendering

Adds the @astrojs/vercel adapter (output: 'static' stays the default for
every other route - this is Astro's documented hybrid pattern, opting
out one route at a time via export const prerender = false). Deep-
research confirmed Vercel's own Deployment Protection cannot be scoped
to a single route on any plan tier, so gating must happen at the
application layer - this task lays the rendering-model groundwork Task 8's
middleware needs. Verified against a real preview deployment that
stats.jsonl's data is still readable at request time (see commit body /
PR description for which of the two documented outcomes applied)."
```

### Task 8: Add HTTP Basic Auth middleware, scoped to `/stats` only

**Files:**
- Create: `src/middleware.ts`
- Test: `tests/middleware.test.ts` (new file, for the pure auth-check logic only — no real HTTP test, matching this repo's "tests never make a real network call" convention)

**Interfaces:**
- Consumes: `STATS_PASSWORD` environment variable (new — must be set in
  Vercel's project settings before this ships; document this in the PR
  description as a manual, one-time operational step, not something a
  test or the code itself can do).
- Produces: `isValidBasicAuth(header: string | null, expectedPassword:
  string): boolean` — a pure, exported, testable function; the middleware
  itself calls it but is not unit-tested directly (Astro middleware
  signatures aren't easily unit-testable in isolation without a real
  request/response cycle).

- [ ] **Step 1: Write the failing test**

Create `tests/middleware.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isValidBasicAuth } from "../src/middleware.js";

const PASSWORD = "correct-password";

function basicAuthHeader(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

describe("isValidBasicAuth", () => {
  it("accepts the correct password regardless of the username field", () => {
    expect(isValidBasicAuth(basicAuthHeader("anything", PASSWORD), PASSWORD)).toBe(true);
  });

  it("rejects the wrong password", () => {
    expect(isValidBasicAuth(basicAuthHeader("owner", "wrong"), PASSWORD)).toBe(false);
  });

  it("rejects a missing Authorization header", () => {
    expect(isValidBasicAuth(null, PASSWORD)).toBe(false);
  });

  it("rejects a non-Basic Authorization scheme", () => {
    expect(isValidBasicAuth("Bearer sometoken", PASSWORD)).toBe(false);
  });

  it("rejects malformed base64 without throwing", () => {
    expect(isValidBasicAuth("Basic not-valid-base64!!!", PASSWORD)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/middleware.test.ts`
Expected: FAIL — `src/middleware.ts` does not exist yet.

- [ ] **Step 3: Create `src/middleware.ts`**

```ts
import { defineMiddleware } from "astro:middleware";

export function isValidBasicAuth(
  header: string | null,
  expectedPassword: string,
): boolean {
  if (!header || !header.startsWith("Basic ")) {
    return false;
  }
  try {
    const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString(
      "utf-8",
    );
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex === -1) {
      return false;
    }
    const password = decoded.slice(separatorIndex + 1);
    return password === expectedPassword;
  } catch {
    return false;
  }
}

export const onRequest = defineMiddleware((context, next) => {
  if (context.url.pathname !== "/stats") {
    return next();
  }

  const expectedPassword = process.env.STATS_PASSWORD;
  if (!expectedPassword) {
    // Fail loud in a way an owner will notice immediately (missing env
    // var is an operational mistake, not a state to silently allow
    // through as if the gate were satisfied) - never fall back to "no
    // password required."
    return new Response("STATS_PASSWORD is not configured.", { status: 500 });
  }

  const header = context.request.headers.get("Authorization");
  if (!isValidBasicAuth(header, expectedPassword)) {
    return new Response("Authentication required.", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="daily-dose stats"' },
    });
  }

  return next();
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/middleware.test.ts`
Expected: all 5 tests PASS.

- [ ] **Step 5: Run the full suite and build**

Run: `npm test && npm run build`

- [ ] **Step 6: Manual end-to-end verification against a real preview deployment**

Set `STATS_PASSWORD` in the Vercel project's environment variables (one-
time manual step — document exactly this in the PR description).
Redeploy the preview, then:
```bash
curl -i https://<preview-url>/stats
# expect: HTTP/2 401, WWW-Authenticate: Basic realm="daily-dose stats"

curl -i -u anyuser:$STATS_PASSWORD https://<preview-url>/stats
# expect: HTTP/2 200, real cost data in the body

curl -i https://<preview-url>/
# expect: HTTP/2 200, unaffected - the homepage is untouched by this middleware
```

- [ ] **Step 7: Commit**

```bash
git add src/middleware.ts tests/middleware.test.ts
git commit -m "feat(stats): gate /stats behind HTTP Basic Auth

Scoped to pathname === '/stats' only via Astro middleware - every other
route is untouched (they're all still static and never reach this
middleware's per-request check). Deliberately fails loud (500) if
STATS_PASSWORD isn't configured, rather than silently allowing access
through - a misconfigured gate must never look like an open one.
isValidBasicAuth() is a pure, unit-tested function; the end-to-end HTTP
behavior was verified against a real Vercel preview deployment per this
repo's convention (no automated test makes a real network call)."
```

### Task 9: Move the interest-score chart into `/stats`, remove the public nav link

**Files:**
- Modify: `src/pages/stats.astro`
- Modify: `src/pages/index.astro`
- Test: `tests/stats-page.test.ts`

**Interfaces:**
- Consumes: `DigestChart` (`{ labels: string[]; scores: number[] }`,
  unchanged), `getCollection('digest')` + `groupEntriesByDate` (same
  pattern `index.astro` used before Phase 2 removed it from there).
- Produces: nothing consumed later — this closes out the deferred half of
  Phase 2.

**Current state** (`index.astro`, nav — the only page whose nav links to
`/stats`):
```astro
    <nav class="site-nav">
      <a href="/stats">Cost &amp; stats &rarr;</a>
      <a href="/archive/">All digests &rarr;</a>
      <a href="/methodology">Methodology &rarr;</a>
    </nav>
```

- [ ] **Step 1: Write the failing test**

Add to `tests/stats-page.test.ts` (mirroring its existing
`readAllPageCss`-based conventions; the exact fixture/read pattern this
file already uses for `dist/stats/index.html` applies here too):

```ts
  it("(backlog) renders the interest-score chart on the owner-only stats page", () => {
    expect(html).toContain('id="score-chart"');
    expect(html).toContain("Interest scores");
  });
```

Add to `tests/build-output.test.ts`:

```ts
  it("(backlog) the homepage nav no longer links to the now-gated /stats page", () => {
    expect(html).not.toMatch(/<nav[^>]*class="site-nav"[^>]*>[\s\S]*?href="\/stats"/);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run build && npx vitest run tests/stats-page.test.ts tests/build-output.test.ts -t "score chart on the owner-only|no longer links to the now-gated"`
Expected: FAIL — the chart isn't on `/stats` yet, and the nav link to
`/stats` is still on the homepage.

- [ ] **Step 3: Add the chart to `stats.astro`**

Add near the top of `stats.astro`'s frontmatter (alongside the existing
`readStats()`/aggregation logic): compute a labels/scores pair from the
same `entries: StatsEntry[]` already read — but `StatsEntry` has no
per-item title/score (it's a per-run cost record, not a digest item), so
this chart needs the **digest** collection, not the stats log. Import and
call the same helpers `index.astro` used before Phase 2:
```ts
import { getCollection } from 'astro:content';
import DigestChart from '../components/DigestChart.astro';
import { groupEntriesByDate } from '../lib/digestGrouping.js';
```
and, alongside the existing `const entries = await readStats();` line,
add:
```ts
const allDigestEntries = await getCollection('digest');
const digestDateGroups = groupEntriesByDate(allDigestEntries);
const latestDigestGroup = digestDateGroups.length > 0 ? digestDateGroups[0] : null;
const chartLabels = latestDigestGroup?.entries.map((entry) => entry.data.title) ?? [];
const chartScores = latestDigestGroup?.entries.map((entry) => entry.data.interest_score) ?? [];
```
Then, in the template: the chart must NOT be nested inside the existing
`{totalRuns === 0 ? (...) : (...)}` ternary (that ternary gates *cost*
data; the chart shows *digest/score* data — a different dataset that can
exist independently of whether cost data does). The real current
structure is:
```astro
      </>
    )}

    <h2 class="section-heading">Page views</h2>
```
Insert the new block strictly between the ternary's closing `)}` and the
`<h2 class="section-heading">Page views</h2>` line — i.e. at the same
unconditional nesting level as "Page views", not inside the `<>...</>`
fragment above it:
```astro
        {chartLabels.length > 0 && (
          <>
            <h2 class="section-heading">Interest scores</h2>
            <DigestChart labels={chartLabels} scores={chartScores} />
          </>
        )}
```

- [ ] **Step 4: Remove the `/stats` nav link from `index.astro`**

Change:
```astro
    <nav class="site-nav">
      <a href="/stats">Cost &amp; stats &rarr;</a>
      <a href="/archive/">All digests &rarr;</a>
      <a href="/methodology">Methodology &rarr;</a>
    </nav>
```
to:
```astro
    <nav class="site-nav">
      <a href="/archive/">All digests &rarr;</a>
      <a href="/methodology">Methodology &rarr;</a>
    </nav>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run build && npm test`
Expected: all green, including the two new tests.

- [ ] **Step 6: Manual verification against the real preview deployment**

Re-check (per Task 8's Step 6 curl commands) that authenticated access to
`/stats` now also shows a real "Interest scores" chart populated from
real digest data, and that the homepage's nav no longer offers a
`/stats` link at all.

- [ ] **Step 7: Commit**

```bash
git add src/pages/stats.astro src/pages/index.astro tests/stats-page.test.ts tests/build-output.test.ts
git commit -m "feat(stats): move the interest-score chart into the owner-gated page

Closes out the half of Phase 2 that was deferred until /stats had
somewhere to receive the chart. Also removes index.astro's 'Cost &
stats' nav link - the only page that linked to /stats publicly - since a
public link inviting every visitor to a page that will 401 them is a
broken promise, not a feature."
```

**Done when (Phase 5 overall):** `npm test` and `npm run build` green;
real preview-deployment verification confirms `/stats` requires
credentials, serves real cost AND score-chart data once authenticated,
and no other route is affected; `STATS_PASSWORD` is documented as a
required manual Vercel env-var step in the PR description.

---

## Phase 6 — Richer Archive

**Branch:** `feat/archive-preview-cards`

### Task 10: Replace bare date links with per-day preview cards

**Files:**
- Create: `src/components/DigestPreviewCard.astro`
- Modify: `src/pages/archive/index.astro`
- Test: `tests/archive-preview-cards.test.ts` (new)

**Interfaces:**
- Consumes: `DigestDateGroup` (`{ date: string; entries:
  CollectionEntry<'digest'>[] }` from `groupEntriesByDate`, already
  sorted by `interest_score` descending per its existing doc comment —
  `entries[0]` is therefore already the lead story, no new "which story
  is the lead" logic needed).
- Produces: `<DigestPreviewCard group={group} />`, consumed only by
  `archive/index.astro` in this task (Phase 6 does not require any other
  page to use it).

**Current state** (`archive/index.astro:26-35`):
```astro
      <ul class="date-list">
        {dateGroups.map((group) => (
          <li class="date-card">
            <a class="date-link" href={`/archive/${group.date}/`}>{group.date}</a>
            <span class="date-count">
              {group.entries.length} item{group.entries.length === 1 ? '' : 's'}
            </span>
          </li>
        ))}
      </ul>
```

- [ ] **Step 1: Write the failing test**

Create `tests/archive-preview-cards.test.ts` (mirroring
`tests/archive-pages.test.ts`'s existing `beforeAll`/`DIST_ARCHIVE_INDEX`/
`readCommittedDates()` pattern — reuse it, do not duplicate a second
copy):

```ts
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { DigestItemSchema } from "../src/lib/digestSchema.js";

const DIST_ARCHIVE_INDEX = join(import.meta.dirname, "..", "dist", "archive", "index.html");
const DIGEST_BASE = join(import.meta.dirname, "..", "src", "data", "digest");

function readLeadStoryForLatestDate() {
  const latestDate = readdirSync(DIGEST_BASE)
    .filter((entry) => existsSync(join(DIGEST_BASE, entry)))
    .sort()
    .at(-1) as string;
  const files = readdirSync(join(DIGEST_BASE, latestDate)).filter((f) => f.endsWith(".json"));
  const items = files.map((f) =>
    DigestItemSchema.parse(JSON.parse(readFileSync(join(DIGEST_BASE, latestDate, f), "utf-8"))),
  );
  items.sort((a, b) => b.interest_score - a.interest_score);
  return { date: latestDate, lead: items[0] };
}

let html: string;

beforeAll(() => {
  if (!existsSync(DIST_ARCHIVE_INDEX)) {
    throw new Error("dist/archive/index.html not found - run `npm run build` first.");
  }
  html = readFileSync(DIST_ARCHIVE_INDEX, "utf-8");
});

describe("archive preview cards", () => {
  it("(backlog) shows the lead story's real title and why_read excerpt for each date, not a bare link", () => {
    const { lead } = readLeadStoryForLatestDate();
    expect(html).toContain(lead.title);
    expect(html).toContain(lead.why_read.slice(0, 40));
  });

  it("(backlog) still shows the real item count per date", () => {
    expect(html).toMatch(/\d+\s*items?/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && npx vitest run tests/archive-preview-cards.test.ts`
Expected: FAIL — `archive/index.astro` currently renders only the date
string and item count, no title or `why_read` text.

- [ ] **Step 3: Create `src/components/DigestPreviewCard.astro`**

```astro
---
import type { DigestDateGroup } from '../lib/digestGrouping.js';

interface Props {
  group: DigestDateGroup;
}

const { group } = Astro.props;
const lead = group.entries[0];
---

<li class="preview-card">
  <a class="preview-date" href={`/archive/${group.date}/`}>{group.date}</a>
  {lead.data.image_url && (
    <img class="preview-image" src={lead.data.image_url} alt="" width="320" height="180" loading="lazy" />
  )}
  <p class="preview-title">{lead.data.title}</p>
  <p class="preview-excerpt">{lead.data.why_read}</p>
  <span class="preview-count">
    {group.entries.length} item{group.entries.length === 1 ? '' : 's'}
  </span>
</li>

<style>
  .preview-card {
    border: 1px solid var(--rule);
    border-radius: 8px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    background: var(--bg-surface);
  }

  .preview-date {
    font-family: var(--font-display);
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--accent);
    text-decoration: none;
  }

  .preview-date:hover {
    text-decoration: underline;
  }

  .preview-image {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    border-radius: 6px;
  }

  .preview-title {
    margin: 0;
    font-family: var(--font-body);
    font-weight: 600;
    color: var(--ink);
  }

  .preview-excerpt {
    margin: 0;
    font-family: var(--font-body);
    font-size: 0.9rem;
    color: var(--ink-soft);
  }

  .preview-count {
    font-family: var(--font-body);
    font-size: 0.85rem;
    color: var(--ink-faint);
  }
</style>
```

- [ ] **Step 4: Use it in `archive/index.astro`**

Add `import DigestPreviewCard from '../../components/DigestPreviewCard.astro';`
and change:
```astro
      <ul class="date-list">
        {dateGroups.map((group) => (
          <li class="date-card">
            <a class="date-link" href={`/archive/${group.date}/`}>{group.date}</a>
            <span class="date-count">
              {group.entries.length} item{group.entries.length === 1 ? '' : 's'}
            </span>
          </li>
        ))}
      </ul>
```
to:
```astro
      <ul class="date-list">
        {dateGroups.map((group) => (
          <DigestPreviewCard group={group} />
        ))}
      </ul>
```
(the existing `.date-list`/`.date-card`/`.date-link`/`.date-count` CSS
rules in this file's `<style>` block become dead code for the old markup
shape — delete them, since `DigestPreviewCard.astro` now owns its own
card styling scoped to itself).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run build && npm test`
Expected: all green, including the 2 new tests.

- [ ] **Step 6: Commit**

```bash
git add src/components/DigestPreviewCard.astro src/pages/archive/index.astro tests/archive-preview-cards.test.ts
git commit -m "feat(archive): show real per-day previews instead of bare date links

Each date on /archive/ now shows its lead story's real title, why_read
excerpt, and image (if any) - directly answering 'you're just showing
the link' - reusing groupEntriesByDate()'s existing lead-story-is-
entries[0] ordering rather than reinventing lead-story selection."
```

### Task 11: Add a calendar date-picker to the masthead, available on every page

**Files:**
- Create: `src/components/DateJump.astro`
- Modify: `src/layouts/Layout.astro` (mount point + minimal shared script)
- Modify: every page that renders a `<header class="masthead">` (pass the
  full valid-dates list so the control can be placed and validated)
- Test: `tests/build-output.test.ts`

**Interfaces:**
- Consumes: the full list of real digest dates. Each page already has
  (or can cheaply compute) this via `groupEntriesByDate(await
  getCollection('digest')).map((g) => g.date)` — `index.astro` doesn't
  currently call this for the full set (only the latest), so it gains one
  new line; `archive/index.astro`/`archive/[date].astro` already compute
  the full set and can pass it straight through.
- Produces: nothing consumed by other tasks — this is the last task in
  the plan.

**Design:** a native `<input type="date">` (per the spec's stated
fallback — no custom calendar component needed unless date-availability
marking is judged necessary later; a native picker with `min`/`max`
bounds and a plain "jump on change" handler is the minimal version that
satisfies "let a reader jump directly to any date's digest," and avoids
building a bespoke calendar widget this repo has no prior pattern for).

- [ ] **Step 1: Write the failing test**

Add to `tests/build-output.test.ts`:

```ts
  it("(backlog) renders a date-jump control in the masthead, bounded to real digest dates", () => {
    expect(html).toMatch(/<input[^>]*type="date"[^>]*id="date-jump"/);
    const minMatch = html.match(/id="date-jump"[^>]*min="(\d{4}-\d{2}-\d{2})"/);
    const maxMatch = html.match(/id="date-jump"[^>]*max="(\d{4}-\d{2}-\d{2})"/);
    expect(minMatch, "expected a min= bound to the earliest real digest date").toBeTruthy();
    expect(maxMatch, "expected a max= bound to the latest real digest date").toBeTruthy();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && npx vitest run tests/build-output.test.ts -t "date-jump control"`
Expected: FAIL — no such input exists yet.

- [ ] **Step 3: Create `src/components/DateJump.astro`**

```astro
---
interface Props {
  dates: string[];
}

const { dates } = Astro.props;
const sorted = [...dates].sort();
const min = sorted[0];
const max = sorted[sorted.length - 1];
---

<input
  type="date"
  id="date-jump"
  class="date-jump"
  aria-label="Jump to a past digest date"
  min={min}
  max={max}
  data-dates={JSON.stringify(dates)}
/>

<style>
  .date-jump {
    font-family: var(--font-body);
    font-size: 0.85rem;
    color: var(--ink);
    background: var(--bg-surface);
    border: 1px solid var(--rule);
    border-radius: 6px;
    padding: 0.3rem 0.5rem;
  }
</style>

<script>
  const input = document.getElementById('date-jump');
  if (input instanceof HTMLInputElement) {
    const validDates = new Set(JSON.parse(input.dataset.dates ?? '[]') as string[]);
    input.addEventListener('change', () => {
      if (validDates.has(input.value)) {
        window.location.href = `/archive/${input.value}/`;
      }
    });
  }
</script>
```

- [ ] **Step 4: Mount it in every masthead**

In each of `src/pages/index.astro`, `src/pages/archive/index.astro`,
`src/pages/archive/[date].astro`, `src/pages/stats.astro`,
`src/pages/methodology.astro`: import `DateJump` and
`getCollection`/`groupEntriesByDate` as needed to compute
`const allDigestDates = groupEntriesByDate(await getCollection('digest')).map((g) => g.date);`
(reuse an already-fetched `getCollection('digest')` result where the page
already has one — `archive/index.astro`'s `dateGroups` already has this
via `dateGroups.map((g) => g.date)`, no second fetch needed there). Add
`<DateJump dates={allDigestDates} />` inside each page's `<header
class="masthead">`, after the `<nav class="site-nav">` and before the
`<h1>`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run build && npm test`
Expected: all green.

- [ ] **Step 6: Manual verification**

`npm run dev`, open the homepage, use the date-jump control to pick a
past real digest date, confirm it navigates to `/archive/{date}/` with
that date's real content.

- [ ] **Step 7: Commit**

```bash
git add src/components/DateJump.astro src/layouts/Layout.astro src/pages/index.astro src/pages/archive/index.astro src/pages/archive/\[date\].astro src/pages/stats.astro src/pages/methodology.astro tests/build-output.test.ts
git commit -m "feat(archive): add a masthead date-jump control on every page

Lets a reader jump directly to any past digest date without first
opening /archive/ - a native <input type=date>, bounded to real digest
dates via min/max, matching the spec's stated minimal-version fallback
rather than a bespoke calendar widget this repo has no prior pattern
for."
```

**Done when (Phase 6 overall):** `npm test` and `npm run build` pass;
manual check confirms `/archive/` shows real per-day previews (title,
excerpt, image where present) and the date-jump control successfully
navigates to a real past date from any page.

---

## Self-Review Notes

- **Spec coverage:** all 6 phases from the spec have at least one task;
  Phase 2 and Phase 5 (Task 9) are split exactly along the line the spec
  itself drew ("chart removal" now, "chart relocation" once `/stats`
  exists to receive it).
- **Placeholder scan:** no TBD/TODO — the two "implementation-time call"
  items the spec explicitly deferred (`Logo.astro` vs. inline markup;
  native `<input type="date">` vs. a custom calendar) are both resolved
  concretely in this plan (Task 6, Task 11), not left open.
- **Type consistency:** `DigestDateGroup` (Task 10) matches
  `digestGrouping.ts`'s real exported interface; `isValidBasicAuth`
  (Task 8) is the one new exported function name and is used identically
  in its test and in `src/middleware.ts`; `DigestPreviewCard`'s `group`
  prop type and `DateJump`'s `dates` prop type are each used consistently
  across their one call site (Task 10) and five call sites (Task 11)
  respectively.
