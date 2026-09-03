# daily-diff Feature-Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close 6 real, verified feature gaps between daily-dose and its inspiration (arpitbbhayani/the-daily-diff) — HN discuss links, a dark/light theme, a public JSON feed, page-view analytics, a working source/signal filter, and a sitemap — with zero changes to the publish path.

**Architecture:** Every task is additive to the existing static Astro site. The one real refactor (extracting `src/layouts/Layout.astro`) happens once, in Phase 2, because the theme toggle needs the `:root` CSS variables defined in exactly one place instead of duplicated across 4 pages. Every other phase is independent of the others except Phase 4, which depends on Phase 2's `Layout.astro` existing.

**Tech Stack:** Astro 5.16.5 (`output: "static"`), TypeScript, Zod, Vitest. New dependencies added by this plan: `@vercel/analytics` (Phase 4), `@astrojs/sitemap` (Phase 6).

**Spec:** `docs/superpowers/specs/2026-09-03-daily-diff-parity-features-design.md`

## Global Constraints

- Astro version floor: `^5.16.5` (already installed — do not downgrade).
- No CSS framework (Bulma, Sass, Tailwind) — plain CSS custom properties only, per `AGENTS.md`.
- No React/Vue — vanilla `<script>` only for any new client-side interactivity, per `AGENTS.md`.
- Zero changes to `scripts/pipeline.ts`, `src/lib/llmCuration.ts`, `src/lib/curation.ts`, `src/lib/costTracking.ts`, `src/lib/digestSchema.ts` — none of these 6 phases need to touch the publish path; if a task seems to require it, stop and re-check against the spec before proceeding.
- Every phase ships as its own PR: branch off `main` → commit(s) → push → `gh pr create` → wait for CI green → squash-merge → delete branch. No `develop` branch (see `Branches.md` — trunk-based GitHub Flow). Six PRs total for this plan (one per phase; Phase 2's 3 tasks share one PR).
- Conventional Commits required on every commit and on the squash-merge message itself.
- Copy shown to readers (tagline text, empty states, button labels) follows `SOUL.md`'s editorial persona — honest, no clickbait.

---

## Phase 1 — Render the HN discussion link

**PR:** `feat/hn-discuss-link`

### Task 1: Add the Discuss link to DigestList.astro

**Files:**
- Modify: `src/components/DigestList.astro`
- Test: `tests/build-output.test.ts`

**Interfaces:**
- Consumes: `entry.data.hn_id` (already `z.number().optional()` in `src/lib/digestSchema.ts:12` — no schema change needed).
- Produces: nothing new consumed elsewhere; this is a leaf UI change.

- [ ] **Step 1: Write the failing test**

Add to `tests/build-output.test.ts`, inside the existing `describe("dist/index.html build output", ...)` block:

```typescript
  it("renders a real HN discussion link for HN-sourced stories", () => {
    const hnFile = findJsonFiles(DIGEST_BASE).find((filePath) => filePath.includes("hn-"));
    expect(hnFile, "expected at least one committed hn-*.json digest file").toBeTruthy();

    const item = DigestItemSchema.parse(JSON.parse(readFileSync(hnFile as string, "utf-8")));
    expect(item.hn_id, "expected the committed HN story to have a real hn_id").toBeTypeOf("number");

    const expectedHref = `https://news.ycombinator.com/item?id=${item.hn_id}`;
    expect(
      html.includes(expectedHref),
      `expected dist/index.html to contain a Discuss link to ${expectedHref}`,
    ).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && npx vitest run tests/build-output.test.ts -t "HN discussion link"`
Expected: FAIL — `expected dist/index.html to contain a Discuss link to https://news.ycombinator.com/item?id=<real id>`

- [ ] **Step 3: Write minimal implementation**

In `src/components/DigestList.astro`, replace the existing `story-meta` block:

```astro
      <div class="story-meta">
        <span class={`badge badge-${entry.data.source}`}>{entry.data.source}</span>
        <span class="score">score: {entry.data.interest_score.toFixed(1)}</span>
        {typeof entry.data.points === 'number' && (
          <span class="points">{entry.data.points} points</span>
        )}
        {typeof entry.data.hn_id === 'number' && (
          <a
            class="discuss-link"
            href={`https://news.ycombinator.com/item?id=${entry.data.hn_id}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Discuss &rarr;
          </a>
        )}
      </div>
```

Add to the existing `<style>` block in the same file:

```css
  .discuss-link {
    color: var(--accent);
    text-decoration: none;
    font-size: 0.85rem;
  }

  .discuss-link:hover {
    text-decoration: underline;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && npx vitest run tests/build-output.test.ts`
Expected: PASS (all tests in the file, including the new one)

- [ ] **Step 5: Run the full suite to confirm no regression**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS, 41/41 (40 existing + 1 new)

- [ ] **Step 6: Commit**

```bash
git add src/components/DigestList.astro tests/build-output.test.ts
git commit -m "feat(site): render HN discussion link on story cards"
```

- [ ] **Step 7: Ship**

```bash
git checkout -b feat/hn-discuss-link
git push -u origin feat/hn-discuss-link
gh pr create --title "feat(site): render HN discussion link on story cards" --body-file <(cat <<'EOF'
## Summary
- Renders a real "Discuss ->" link on HN-sourced story cards using the already-captured hn_id field.
- Closes gap #4 from the daily-diff comparison (verified 2026-09-03).

## Test plan
- [x] npx tsc --noEmit -- clean
- [x] npx vitest run -- 41/41 passing
- [ ] CI green on this PR
EOF
)
gh pr checks --watch
gh pr merge --squash --delete-branch
```

---

## Phase 2 — Shared Layout + dark/light theme toggle

**PR:** `feat/theme-toggle` (all 3 tasks below in one PR — they're one cohesive, inseparable deliverable: the Layout has no purpose without the pages that use it, and the toggle has no CSS to control without the Layout's dark-mode variables)

### Task 2: Extract src/layouts/Layout.astro

**Files:**
- Create: `src/layouts/Layout.astro`
- Test: `tests/build-output.test.ts`, `tests/archive-pages.test.ts`, `tests/stats-page.test.ts` (existing e2e tests — must keep passing unchanged after Task 3 migrates pages to use this)

**Interfaces:**
- Consumes: `SiteMeta.astro` (unchanged, existing component).
- Produces: a `Layout` component with props `{ title: string; description: string; path: string; includeRssLink?: boolean }` (default `true`), rendering `<!doctype html><html><head>...</head><body><slot /></body></html>` plus the shared global CSS. Task 3 imports this from `../layouts/Layout.astro` (pages) or `../../layouts/Layout.astro` (archive pages).

- [ ] **Step 1: Write the failing test**

This task has no isolated test of its own — `Layout.astro` isn't used by anything yet, so there's nothing to assert against. Its correctness is proven by Task 3 (pages migrated to use it) continuing to pass every existing e2e test. Skip to Step 3.

- [ ] **Step 2: N/A** — see above.

- [ ] **Step 3: Write the implementation**

Create `src/layouts/Layout.astro`:

```astro
---
import SiteMeta from '../components/SiteMeta.astro';
import ThemeToggle from '../components/ThemeToggle.astro';

interface Props {
  title: string;
  description: string;
  path: string;
  includeRssLink?: boolean;
}

const { title, description, path, includeRssLink = true } = Astro.props;
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{title}</title>
    <SiteMeta title={title} description={description} path={path} />
    {includeRssLink && (
      <link rel="alternate" type="application/rss+xml" title="daily-dose" href="/rss.xml" />
    )}
  </head>
  <body>
    <ThemeToggle />
    <slot />
    <style is:global>
      :root {
        color-scheme: light dark;
        --bg: #ffffff;
        --fg: #1a1a1a;
        --muted: #6b7280;
        --border: #e5e7eb;
        --accent: #4f46e5;
      }

      [data-theme='dark'] {
        --bg: #0f1115;
        --fg: #e5e7eb;
        --muted: #9ca3af;
        --border: #27272a;
        --accent: #818cf8;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family:
          -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        background: var(--bg);
        color: var(--fg);
        line-height: 1.5;
      }

      .masthead {
        padding: 2rem 1.5rem 1rem;
        border-bottom: 1px solid var(--border);
      }

      .site-nav {
        display: flex;
        gap: 1rem;
      }

      .site-nav a {
        color: var(--accent);
        text-decoration: none;
        font-size: 0.9rem;
      }

      .site-nav a:hover {
        text-decoration: underline;
      }

      .masthead h1 {
        margin: 0.5rem 0 0;
        font-size: 2rem;
      }

      .tagline {
        margin: 0.25rem 0 0;
        color: var(--muted);
      }

      main {
        max-width: 800px;
        margin: 0 auto;
        padding: 1.5rem;
      }

      .section-heading {
        font-size: 1.25rem;
        margin-top: 2rem;
      }

      .empty-state {
        color: var(--muted);
      }

      .site-footer {
        max-width: 800px;
        margin: 2rem auto 0;
        padding: 1rem 1.5rem 2rem;
        border-top: 1px solid var(--border);
        color: var(--muted);
        font-size: 0.85rem;
      }
    </style>
  </body>
</html>
```

Note: `is:global` is Astro's documented directive for CSS that must apply to elements outside the defining component's own template (here, every page's slotted content) — this is the correct mechanism, not a workaround. Source: Astro's own Styling docs (`docs.astro.build/en/guides/styling/#global-styles`).

- [ ] **Step 4: N/A** — verified by Task 3's steps.
- [ ] **Step 5: Commit** (combined with Task 3 and Task 4 — see Task 4's Step 8)

### Task 3: Migrate all 4 existing pages to use Layout.astro

**Files:**
- Modify: `src/pages/index.astro`
- Modify: `src/pages/stats.astro`
- Modify: `src/pages/archive/index.astro`
- Modify: `src/pages/archive/[date].astro`
- Test: existing `tests/build-output.test.ts`, `tests/archive-pages.test.ts`, `tests/stats-page.test.ts`, `tests/rss-feed.test.ts` (must all keep passing unchanged — this proves the migration preserved behavior)

**Interfaces:**
- Consumes: `Layout` from Task 2 (`../layouts/Layout.astro` / `../../layouts/Layout.astro`), props `{ title, description, path, includeRssLink? }`.
- Produces: nothing new; output HTML must be behaviorally identical to before (same visible text, same classes, same links) except for the addition of the theme-toggle button (covered by Task 4).

- [ ] **Step 1: Confirm the baseline (tests currently pass before touching pages)**

Run: `npm run build && npx vitest run`
Expected: PASS, 41/41 (Phase 1's test included) — this is the baseline Task 3 must not break.

- [ ] **Step 2: Migrate `src/pages/index.astro`**

Replace the entire file content with:

```astro
---
import { getCollection } from 'astro:content';
import DigestChart from '../components/DigestChart.astro';
import DigestList from '../components/DigestList.astro';
import Layout from '../layouts/Layout.astro';
import { groupEntriesByDate } from '../lib/digestGrouping.js';

const allEntries = await getCollection('digest');
const dateGroups = groupEntriesByDate(allEntries);

const latestGroup = dateGroups.length > 0 ? dateGroups[0] : null;
const latestDate = latestGroup?.date ?? null;
const latestEntries = latestGroup?.entries ?? [];

const chartLabels = latestEntries.map((entry) => entry.data.title);
const chartScores = latestEntries.map((entry) => entry.data.interest_score);
---

<Layout
  title="daily-dose"
  description="A daily AI-curated technical digest — Hacker News, arXiv, GitHub, and Dev.to."
  path="/"
>
  <header class="masthead">
    <nav class="site-nav">
      <a href="/stats">Cost &amp; stats &rarr;</a>
      <a href="/archive/">All digests &rarr;</a>
    </nav>
    <h1>daily-dose</h1>
    <p class="tagline">A daily AI-curated technical digest — Hacker News, arXiv, GitHub, and Dev.to.</p>
  </header>

  <main>
    {latestDate ? (
      <>
        <h2 class="section-heading">Latest digest — {latestDate}</h2>
        <DigestList entries={latestEntries} />

        <h2 class="section-heading">Interest scores</h2>
        <DigestChart labels={chartLabels} scores={chartScores} />
      </>
    ) : (
      <p class="empty-state">
        No digest data yet. Run <code>npm run pipeline</code> to fetch the latest Hacker News,
        arXiv, GitHub, and Dev.to content and generate today's digest.
      </p>
    )}
  </main>

  <footer class="site-footer">
    <p>
      Curation is a real AWS Bedrock LLM call by default, with a deterministic placeholder
      heuristic as an explicit fallback (missing credentials, or a per-item response gap) —
      see the project README, or <a href="/stats">cost &amp; stats</a> for real usage data.
    </p>
  </footer>
</Layout>
```

- [ ] **Step 3: Migrate `src/pages/stats.astro`**

Keep the entire frontmatter (`---...---` script block with `readStats`/aggregation logic) unchanged. Replace only the `<!doctype html>...</html>` markup with:

```astro
<Layout
  title="daily-dose — cost & stats"
  description="Real AWS Bedrock LLM curation cost for daily-dose, tracked from actual token usage — not estimated."
  path="/stats"
  includeRssLink={false}
>
  <header class="masthead">
    <nav class="site-nav"><a href="/">&larr; Back to digest</a></nav>
    <h1>Cost &amp; stats</h1>
    <p class="tagline">
      Real AWS Bedrock LLM curation cost, tracked from actual token usage — not estimated.
    </p>
  </header>

  <main>
    {totalRuns === 0 ? (
      <p class="empty-state">
        No real LLM cost data recorded yet. This page only has data once a pipeline run
        actually makes a real Bedrock call (see <code>src/lib/llmCuration.ts</code>) — runs
        that fall back to the placeholder heuristic produce no cost and are never logged here.
      </p>
    ) : (
      <>
        <h2 class="section-heading">Totals since tracking began</h2>
        <ul class="totals-grid">
          <li class="totals-card">
            <span class="totals-value">{formatUsd(totalCostUsd)}</span>
            <span class="totals-label">total cost</span>
          </li>
          <li class="totals-card">
            <span class="totals-value">{totalRuns}</span>
            <span class="totals-label">real LLM runs</span>
          </li>
          <li class="totals-card">
            <span class="totals-value">{totalItemsScored}</span>
            <span class="totals-label">items scored by a real model</span>
          </li>
          <li class="totals-card">
            <span class="totals-value">{(totalInputTokens + totalOutputTokens).toLocaleString()}</span>
            <span class="totals-label">total tokens ({totalInputTokens.toLocaleString()} in / {totalOutputTokens.toLocaleString()} out)</span>
          </li>
        </ul>
        {anomalousRuns > 0 && (
          <p class="anomaly-note">
            {anomalousRuns} run{anomalousRuns === 1 ? '' : 's'} flagged as anomalous (cost more
            than 5x the trailing 7-day average at the time) — see <code>telemetry.md</code>.
          </p>
        )}

        <h2 class="section-heading">By model</h2>
        <table class="stats-table">
          <thead>
            <tr>
              <th>Model</th>
              <th>Runs</th>
              <th>Items scored</th>
              <th>Input tokens</th>
              <th>Output tokens</th>
              <th>Cost</th>
            </tr>
          </thead>
          <tbody>
            {modelRows.map(([model, agg]) => (
              <tr>
                <td class="model-cell">{model}</td>
                <td>{agg.runs}</td>
                <td>{agg.itemCount}</td>
                <td>{agg.inputTokens.toLocaleString()}</td>
                <td>{agg.outputTokens.toLocaleString()}</td>
                <td>{formatUsd(agg.costUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 class="section-heading">By day</h2>
        <table class="stats-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Runs</th>
              <th>Items scored</th>
              <th>Cost</th>
            </tr>
          </thead>
          <tbody>
            {dayRows.map(([date, agg]) => (
              <tr>
                <td>
                  {date}
                  {agg.flaggedAnomalous && <span class="anomaly-badge" title="anomalous run">!</span>}
                </td>
                <td>{agg.runs}</td>
                <td>{agg.itemCount}</td>
                <td>{formatUsd(agg.costUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    )}
  </main>

  <footer class="site-footer">
    <p>
      Scope: real per-run LLM cost only, from actual Bedrock response token usage. Not shown:
      per-story cost (too granular to be meaningful publicly) or raw per-call logs. See
      <code>telemetry.md</code> for the full design and <code>decisions.md</code>'s ADR 0003
      for why real LLM curation exists at all.
    </p>
  </footer>
</Layout>
```

Update the import line at the top of the frontmatter from
`import SiteMeta from '../components/SiteMeta.astro';` to
`import Layout from '../layouts/Layout.astro';` (remove the now-unused `SiteMeta` import — `Layout` uses it internally).

Delete the page's own `<style>` block entirely (the shared rules moved to `Layout.astro`) **except** keep these `stats.astro`-specific selectors in a new, smaller scoped `<style>` block at the end of the file: `.totals-grid`, `.totals-card`, `.totals-value`, `.totals-label`, `.anomaly-note`, `.anomaly-badge`, `.stats-table`, `.stats-table th`, `.stats-table td`, `.stats-table th`, `.model-cell` (copy these rules verbatim from the current file — do not change their declarations, only their location).

- [ ] **Step 4: Migrate `src/pages/archive/index.astro`**

```astro
---
import { getCollection } from 'astro:content';
import Layout from '../../layouts/Layout.astro';
import { groupEntriesByDate } from '../../lib/digestGrouping.js';

const allEntries = await getCollection('digest');
const dateGroups = groupEntriesByDate(allEntries);
---

<Layout
  title="daily-dose — all digests"
  description="Every past daily-dose digest, browsable by date — AI-curated Hacker News, arXiv, GitHub, and Dev.to picks, one day at a time."
  path="/archive/"
>
  <header class="masthead">
    <nav class="site-nav"><a href="/">&larr; Back to digest</a></nav>
    <h1>All digests</h1>
    <p class="tagline">Every past day's digest, most recent first.</p>
  </header>

  <main>
    {dateGroups.length > 0 ? (
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
    ) : (
      <p class="empty-state">
        No digest data yet. Run <code>npm run pipeline</code> to fetch the latest Hacker News,
        arXiv, and GitHub content and generate the first digest.
      </p>
    )}
  </main>
</Layout>

<style>
  .date-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .date-card {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .date-link {
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--accent);
    text-decoration: none;
  }

  .date-link:hover {
    text-decoration: underline;
  }

  .date-count {
    font-size: 0.85rem;
    color: var(--muted);
  }
</style>
```

- [ ] **Step 5: Migrate `src/pages/archive/[date].astro`**

```astro
---
import { getCollection } from 'astro:content';
import type { CollectionEntry } from 'astro:content';
import DigestChart from '../../components/DigestChart.astro';
import DigestList from '../../components/DigestList.astro';
import Layout from '../../layouts/Layout.astro';
import { groupEntriesByDate } from '../../lib/digestGrouping.js';

interface DateParams {
  date: string;
}

interface DateProps {
  entries: CollectionEntry<'digest'>[];
  olderDate: string | null;
  newerDate: string | null;
}

export async function getStaticPaths() {
  const allEntries = await getCollection('digest');
  const dateGroups = groupEntriesByDate(allEntries);

  return dateGroups.map((group, index) => ({
    params: { date: group.date },
    props: {
      entries: group.entries,
      olderDate: dateGroups[index + 1]?.date ?? null,
      newerDate: index > 0 ? dateGroups[index - 1].date : null,
    },
  }));
}

const { date } = Astro.params as unknown as DateParams;
const { entries, olderDate, newerDate } = Astro.props as DateProps;

const chartLabels = entries.map((entry) => entry.data.title);
const chartScores = entries.map((entry) => entry.data.interest_score);
---

<Layout
  title={`daily-dose — ${date}`}
  description={`The daily-dose digest for ${date} — AI-curated Hacker News, arXiv, GitHub, and Dev.to picks from that day.`}
  path={`/archive/${date}/`}
>
  <header class="masthead">
    <nav class="site-nav">
      <a href="/">&larr; Latest digest</a>
      <a href="/archive/">All digests</a>
    </nav>
    <h1>Digest — {date}</h1>
    <p class="tagline">A daily AI-curated technical digest — Hacker News, arXiv, GitHub, and Dev.to.</p>
  </header>

  <main>
    <DigestList entries={entries} />

    <h2 class="section-heading">Interest scores</h2>
    <DigestChart labels={chartLabels} scores={chartScores} />

    <nav class="date-nav">
      <span>
        {olderDate ? <a href={`/archive/${olderDate}/`}>&larr; Older ({olderDate})</a> : null}
      </span>
      <span>
        {newerDate ? <a href={`/archive/${newerDate}/`}>Newer ({newerDate}) &rarr;</a> : null}
      </span>
    </nav>
  </main>
</Layout>

<style>
  .date-nav {
    margin-top: 2rem;
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    font-size: 0.9rem;
  }

  .date-nav a {
    color: var(--accent);
    text-decoration: none;
  }

  .date-nav a:hover {
    text-decoration: underline;
  }
</style>
```

- [ ] **Step 6: N/A** — verified together with Task 4 (Layout has no visible effect until `ThemeToggle` exists, since `<ThemeToggle />` is imported by `Layout.astro` in Task 2 but the component doesn't exist until Task 4). **Do Task 4 before running any test** — Task 2's `Layout.astro` import of `../components/ThemeToggle.astro` will fail to build otherwise.

### Task 4: Add ThemeToggle.astro

**Files:**
- Create: `src/components/ThemeToggle.astro`
- Test: `tests/build-output.test.ts`

**Interfaces:**
- Consumes: nothing (self-contained; reads/writes `localStorage` and `document.documentElement.dataset.theme` directly).
- Produces: sets `document.documentElement.dataset.theme` to `'dark'` or removes it, which `Layout.astro`'s `is:global` CSS (Task 2) reacts to via the `[data-theme='dark']` selector.

- [ ] **Step 1: Write the failing test**

Add to `tests/build-output.test.ts`:

```typescript
  it("has a real theme toggle button with a persistence script", () => {
    expect(html.includes('id="theme-toggle"')).toBe(true);
    expect(html.includes("localStorage")).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/build-output.test.ts -t "theme toggle"`
Expected: FAIL — `npm run build` itself will fail first with a missing-module error for `../components/ThemeToggle.astro` (imported by `Layout.astro` in Task 2), which is the expected failing state at this point in the plan.

- [ ] **Step 3: Write the implementation**

Create `src/components/ThemeToggle.astro`:

```astro
---
---

<button id="theme-toggle" type="button" class="theme-toggle" aria-label="Toggle dark mode">
  <svg class="icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="5"></circle>
    <line x1="12" y1="1" x2="12" y2="3"></line>
    <line x1="12" y1="21" x2="12" y2="23"></line>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
    <line x1="1" y1="12" x2="3" y2="12"></line>
    <line x1="21" y1="12" x2="23" y2="12"></line>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
  </svg>
  <svg class="icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
  </svg>
</button>

<style>
  .theme-toggle {
    position: fixed;
    top: 1rem;
    right: 1rem;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 50%;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--fg);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 10;
  }

  .icon-moon {
    display: none;
  }

  :global([data-theme='dark']) .icon-sun {
    display: none;
  }

  :global([data-theme='dark']) .icon-moon {
    display: block;
  }
</style>

<script>
  const STORAGE_KEY = 'theme';
  const button = document.getElementById('theme-toggle');

  if (localStorage.getItem(STORAGE_KEY) === 'dark') {
    document.documentElement.dataset.theme = 'dark';
  }

  button?.addEventListener('click', () => {
    const isDark = document.documentElement.dataset.theme === 'dark';
    if (isDark) {
      delete document.documentElement.dataset.theme;
      localStorage.setItem(STORAGE_KEY, 'light');
    } else {
      document.documentElement.dataset.theme = 'dark';
      localStorage.setItem(STORAGE_KEY, 'dark');
    }
  });
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && npx vitest run`
Expected: PASS, 42/42 (41 from Phase 1 + this new one). This single command validates Tasks 2, 3, and 4 together, since none of them are independently buildable in isolation (`Layout.astro` needs `ThemeToggle.astro` to exist; the pages need `Layout.astro` to exist).

- [ ] **Step 5: Manual verification (theme persistence is not covered by static-HTML assertions)**

Run: `npm run dev`, open `http://localhost:4321`, click the toggle button, confirm the page switches to dark colors, reload the page, confirm it stays dark. This is a real, necessary manual check — Vitest's e2e suite reads static `dist/` HTML and cannot execute the click handler or observe `localStorage` persistence across a reload.

- [ ] **Step 6: Commit**

```bash
git add src/layouts/Layout.astro src/components/ThemeToggle.astro src/pages/index.astro src/pages/stats.astro src/pages/archive/index.astro "src/pages/archive/[date].astro" tests/build-output.test.ts
git commit -m "feat(site): extract shared Layout and add a dark/light theme toggle"
```

- [ ] **Step 7: Ship**

```bash
git checkout -b feat/theme-toggle
git push -u origin feat/theme-toggle
gh pr create --title "feat(site): extract shared Layout and add a dark/light theme toggle"
gh pr checks --watch
gh pr merge --squash --delete-branch
```

---

## Phase 3 — `/latest.json` public endpoint

**PR:** `feat/latest-json-endpoint`

### Task 5: Add the /latest.json route

**Files:**
- Create: `src/pages/latest.json.ts`
- Test: `tests/latest-json.test.ts` (new file, mirrors `tests/rss-feed.test.ts`'s e2e structure)

**Interfaces:**
- Consumes: `groupEntriesByDate()` (`src/lib/digestGrouping.ts`), `getCollection('digest')` (Astro Content Collections).
- Produces: `GET /latest.json` → `Response` with `Content-Type: application/json`, body = JSON array of `DigestItem` objects (the shape defined in `src/lib/digestSchema.ts`).

- [ ] **Step 1: Write the failing test**

Create `tests/latest-json.test.ts`:

```typescript
// PRECONDITION: e2e-style test reading already-built output — run `npm run
// build` first. Matches tests/build-output.test.ts's convention.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { DigestItemSchema } from "../src/lib/digestSchema.js";

const DIST_LATEST_JSON = join(import.meta.dirname, "..", "dist", "latest.json");

let raw: string;

beforeAll(() => {
  if (!existsSync(DIST_LATEST_JSON)) {
    throw new Error("dist/latest.json not found — run `npm run build` first.");
  }
  raw = readFileSync(DIST_LATEST_JSON, "utf-8");
});

describe("dist/latest.json", () => {
  it("is valid JSON containing a real array of items", () => {
    const parsed = JSON.parse(raw);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
  });

  it("every item validates against DigestItemSchema", () => {
    const parsed = JSON.parse(raw);
    for (const item of parsed) {
      expect(() => DigestItemSchema.parse(item)).not.toThrow();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && npx vitest run tests/latest-json.test.ts`
Expected: FAIL — `dist/latest.json not found`

- [ ] **Step 3: Write the implementation**

Create `src/pages/latest.json.ts`:

```typescript
import type { APIContext } from "astro";
import { getCollection } from "astro:content";
import { groupEntriesByDate } from "../lib/digestGrouping.js";

export async function GET(_context: APIContext): Promise<Response> {
  const allEntries = await getCollection("digest");
  const dateGroups = groupEntriesByDate(allEntries);
  const latestGroup = dateGroups.length > 0 ? dateGroups[0] : null;
  const items = latestGroup ? latestGroup.entries.map((entry) => entry.data) : [];

  return new Response(JSON.stringify(items, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && npx vitest run`
Expected: PASS, 44/44 (42 from Phase 2 + 2 new)

**Note on the empty-digest-directory path:** the spec requires `/latest.json` to return `[]` (not an error) when no digest data exists yet. `dateGroups.length > 0 ? dateGroups[0] : null` combined with `latestGroup ? ... : []` in Step 3's implementation handles this by inspection — it is the exact same pattern `index.astro` already uses for its own empty state (`latestGroup?.entries ?? []`), which itself has no dedicated automated test in this codebase today. This plan does not add one either, for the same reason: there is no committed fixture for "zero digest data" and this project's e2e tests only run against real committed data, never a mocked/empty content collection. This is a real, accepted testing gap — flagged here rather than silently skipped, not a defect introduced by this task.

- [ ] **Step 5: Commit**

```bash
git add src/pages/latest.json.ts tests/latest-json.test.ts
git commit -m "feat(site): add public /latest.json machine-readable endpoint"
```

- [ ] **Step 6: Ship**

```bash
git checkout -b feat/latest-json-endpoint
git push -u origin feat/latest-json-endpoint
gh pr create --title "feat(site): add public /latest.json machine-readable endpoint"
gh pr checks --watch
gh pr merge --squash --delete-branch
```

---

## Phase 4 — Vercel Web Analytics

**PR:** `feat/vercel-web-analytics`
**Depends on:** Phase 2 (`src/layouts/Layout.astro` must exist)

### Task 6: Add @vercel/analytics to Layout.astro and note it on /stats

**Files:**
- Modify: `package.json` (new dependency)
- Modify: `src/layouts/Layout.astro`
- Modify: `src/pages/stats.astro`
- Test: `tests/build-output.test.ts`

**Interfaces:**
- Consumes: `@vercel/analytics`'s Astro entry point (verify exact import in Step 3 sub-step below — do not guess the API without checking the installed package first).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Write the failing test**

Add to `tests/build-output.test.ts`:

```typescript
  it("includes the Vercel Web Analytics script", () => {
    expect(html.includes("/_vercel/insights/script.js") || html.includes("va.vercel-scripts.com")).toBe(true);
  });
```

(This asserts on the known script URL Vercel's Analytics component injects — verify the exact string in Step 3's sub-step against the installed package's actual rendered output, and correct this test if it differs before calling it done.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm install @vercel/analytics && npm run build && npx vitest run tests/build-output.test.ts -t "Vercel Web Analytics"`
Expected: FAIL — no analytics script present yet.

- [ ] **Step 3: Write the implementation**

First, verify the exact import for Astro before writing it into source:

```bash
cat node_modules/@vercel/analytics/package.json | grep -A5 '"exports"'
ls node_modules/@vercel/analytics/dist/astro/ 2>/dev/null || ls node_modules/@vercel/analytics/astro/ 2>/dev/null
```

Confirm whether the package exposes `@vercel/analytics/astro` and whether its export is a default export or a named `Analytics` export — adjust the import line below to match exactly what's found (do not proceed with an unverified import).

In `src/layouts/Layout.astro`, add the import and component (adjust the import line per the verification above; this is the expected shape as of the current published package):

```astro
import { Analytics } from '@vercel/analytics/astro';
```

and inside `<body>`, alongside `<ThemeToggle />`:

```astro
    <Analytics />
    <ThemeToggle />
    <slot />
```

In `src/pages/stats.astro`, add a new section inside `<main>`, right after the closing `</table>` of the "By day" table (inside the non-empty branch):

```astro
        <h2 class="section-heading">Page views</h2>
        <p>
          Real page-view analytics are collected via Vercel Web Analytics but are only
          queryable through Vercel's own dashboard — they can't be read at static-build time
          the way LLM cost above is. See the dashboard directly for real traffic numbers.
        </p>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && npx vitest run`
Expected: PASS, 45/45. If the assertion string from Step 1 doesn't match what the installed package actually renders, update the test to match the real, observed output — do not weaken the assertion to something that would pass regardless of whether analytics is actually wired up.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/layouts/Layout.astro src/pages/stats.astro tests/build-output.test.ts
git commit -m "feat(site): add Vercel Web Analytics"
```

- [ ] **Step 6: Ship**

```bash
git checkout -b feat/vercel-web-analytics
git push -u origin feat/vercel-web-analytics
gh pr create --title "feat(site): add Vercel Web Analytics"
gh pr checks --watch
gh pr merge --squash --delete-branch
```

---

## Phase 5 — Source + Signal filter UI

**PR:** `feat/source-signal-filter` (both tasks in one PR — the filter component has no purpose without the tier-bucketing logic, and the logic has no consumer without the component)

### Task 7: Add interestTier() pure logic with unit tests

**Files:**
- Create: `src/lib/interestTier.ts`
- Test: `tests/interestTier.test.ts` (new file)

**Interfaces:**
- Consumes: nothing.
- Produces: `export type InterestTier = "notable" | "recommended" | "must-read"` and `export function interestTier(score: number): InterestTier`. Task 8 imports both.

- [ ] **Step 1: Write the failing test**

Create `tests/interestTier.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { interestTier } from "../src/lib/interestTier.js";

describe("interestTier", () => {
  it("returns 'notable' for scores below 6", () => {
    expect(interestTier(0)).toBe("notable");
    expect(interestTier(5.9)).toBe("notable");
  });

  it("returns 'recommended' for scores 6 up to (not including) 8", () => {
    expect(interestTier(6)).toBe("recommended");
    expect(interestTier(7.9)).toBe("recommended");
  });

  it("returns 'must-read' for scores 8 and above", () => {
    expect(interestTier(8)).toBe("must-read");
    expect(interestTier(10)).toBe("must-read");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/interestTier.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/interestTier.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/interestTier.ts`:

```typescript
export type InterestTier = "notable" | "recommended" | "must-read";

export function interestTier(score: number): InterestTier {
  if (score >= 8) return "must-read";
  if (score >= 6) return "recommended";
  return "notable";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/interestTier.test.ts`
Expected: PASS, 3/3

- [ ] **Step 5: Commit**

```bash
git add src/lib/interestTier.ts tests/interestTier.test.ts
git commit -m "feat(site): add interestTier pure scoring-tier logic"
```

### Task 8: Add the FilterBar component and wire it into DigestList

**Files:**
- Create: `src/components/FilterBar.astro`
- Modify: `src/components/DigestList.astro`
- Modify: `src/pages/index.astro` (render `<FilterBar />` above `<DigestList />`)
- Modify: `src/pages/archive/[date].astro` (same)
- Test: `tests/build-output.test.ts`

**Interfaces:**
- Consumes: `interestTier()` from Task 7 (`../lib/interestTier.js`).
- Produces: `data-source` and `data-interest-tier` attributes on each `.story-card` (consumed by `FilterBar.astro`'s client-side script via `document.querySelectorAll('.story-card')`); no other file depends on this.

- [ ] **Step 1: Write the failing test**

Add to `tests/build-output.test.ts`:

```typescript
  it("renders filter controls with a real All option for source and signal tier", () => {
    expect(html.includes('data-filter-group="source"')).toBe(true);
    expect(html.includes('data-filter-group="tier"')).toBe(true);
    expect(html.includes('data-filter-value="all"')).toBe(true);
  });

  it("tags every story card with its source and interest tier", () => {
    expect(html.includes("data-source=")).toBe(true);
    expect(html.includes("data-interest-tier=")).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && npx vitest run tests/build-output.test.ts -t "filter"`
Expected: FAIL — no filter markup or data attributes exist yet.

- [ ] **Step 3: Write the implementation**

In `src/components/DigestList.astro`, add the import and tag each card. Replace:

```astro
---
import type { CollectionEntry } from 'astro:content';

interface Props {
  entries: CollectionEntry<'digest'>[];
}

const { entries } = Astro.props;
---
```

with:

```astro
---
import type { CollectionEntry } from 'astro:content';
import { interestTier } from '../lib/interestTier.js';

interface Props {
  entries: CollectionEntry<'digest'>[];
}

const { entries } = Astro.props;
---
```

and replace the opening `<li class="story-card">` tag with:

```astro
    <li
      class="story-card"
      data-source={entry.data.source}
      data-interest-tier={interestTier(entry.data.interest_score)}
    >
```

Create `src/components/FilterBar.astro`:

```astro
---
const SOURCES = ["hn", "arxiv", "github", "devto"] as const;
const TIERS = [
  { value: "notable", label: "Notable" },
  { value: "recommended", label: "Recommended" },
  { value: "must-read", label: "Must-Read" },
] as const;
---

<div class="filter-bar" id="filter-bar">
  <div class="filter-group" data-filter-group="source">
    <button type="button" class="filter-btn active" data-filter-value="all">All</button>
    {SOURCES.map((source) => (
      <button type="button" class="filter-btn" data-filter-value={source}>{source}</button>
    ))}
  </div>
  <div class="filter-group" data-filter-group="tier">
    <button type="button" class="filter-btn active" data-filter-value="all">All</button>
    {TIERS.map((tier) => (
      <button type="button" class="filter-btn" data-filter-value={tier.value}>{tier.label}</button>
    ))}
  </div>
</div>
<p class="empty-state" id="filter-empty-state" hidden>No stories match the selected filters.</p>

<style>
  .filter-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .filter-group {
    display: flex;
    gap: 0.4rem;
  }

  .filter-btn {
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--fg);
    border-radius: 999px;
    padding: 0.3rem 0.75rem;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .filter-btn.active {
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 600;
  }
</style>

<script>
  const filterBar = document.getElementById('filter-bar');
  const emptyState = document.getElementById('filter-empty-state');

  let activeSource = 'all';
  let activeTier = 'all';

  function applyFilters() {
    const cards = Array.from(document.querySelectorAll<HTMLElement>('.story-card'));
    let visibleCount = 0;
    for (const card of cards) {
      const matchesSource = activeSource === 'all' || card.dataset.source === activeSource;
      const matchesTier = activeTier === 'all' || card.dataset.interestTier === activeTier;
      const visible = matchesSource && matchesTier;
      card.hidden = !visible;
      if (visible) visibleCount += 1;
    }
    if (emptyState) emptyState.hidden = visibleCount !== 0;
  }

  filterBar?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest<HTMLElement>('.filter-btn');
    if (!button) return;
    const group = button.closest<HTMLElement>('[data-filter-group]');
    const groupName = group?.dataset.filterGroup;
    const value = button.dataset.filterValue;
    if (!groupName || !value) return;

    if (groupName === 'source') activeSource = value;
    if (groupName === 'tier') activeTier = value;

    const buttons = group?.querySelectorAll<HTMLElement>('.filter-btn') ?? [];
    for (const btn of buttons) {
      btn.classList.toggle('active', btn === button);
    }
    applyFilters();
  });
</script>
```

In `src/pages/index.astro`, add the import (`import FilterBar from '../components/FilterBar.astro';`) and render `<FilterBar />` immediately before `<DigestList entries={latestEntries} />` (inside the `latestDate ?` truthy branch, after the `<h2 class="section-heading">Latest digest — {latestDate}</h2>` line).

In `src/pages/archive/[date].astro`, add the same import (`../../components/FilterBar.astro`) and render `<FilterBar />` immediately before `<DigestList entries={entries} />`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && npx vitest run`
Expected: PASS, 48/48 (44 from Phase 3 + 2 from Task 7 + 2 from this task — Phase 4's count assumed already merged per PR order; if Phase 4 hasn't merged yet, adjust the expected total accordingly by re-running `npx vitest run` and reading its own reported count rather than trusting this plan's arithmetic).

- [ ] **Step 5: Manual verification (client-side filtering interactivity)**

Run: `npm run dev`, open `http://localhost:4321`, click each source button and each tier button, confirm only matching cards remain visible, confirm the "No stories match" message appears when a combination matches nothing (e.g. click "devto" then "must-read" if no committed Dev.to data exists yet), confirm "All" restores everything. This is a real, necessary manual check — this project's Vitest suite has no browser/jsdom automation to click buttons and observe DOM changes.

- [ ] **Step 6: Commit**

```bash
git add src/components/FilterBar.astro src/components/DigestList.astro src/pages/index.astro "src/pages/archive/[date].astro" tests/build-output.test.ts
git commit -m "feat(site): add source and signal-tier filter UI"
```

- [ ] **Step 7: Ship**

```bash
git checkout -b feat/source-signal-filter
git push -u origin feat/source-signal-filter
gh pr create --title "feat(site): add source and signal-tier filter UI"
gh pr checks --watch
gh pr merge --squash --delete-branch
```

---

## Phase 6 — Sitemap

**PR:** `feat/sitemap`

### Task 9: Add @astrojs/sitemap

**Files:**
- Modify: `astro.config.mjs`
- Modify: `package.json` (new dependency)
- Test: `tests/sitemap.test.ts` (new file)

**Interfaces:**
- Consumes: nothing project-specific — `@astrojs/sitemap` reads `site`/routes automatically from the Astro build.
- Produces: nothing consumed by other project code.

- [ ] **Step 1: Write the failing test**

Create `tests/sitemap.test.ts`:

```typescript
// PRECONDITION: e2e-style test reading already-built output — run `npm run
// build` first.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const DIST_SITEMAP_INDEX = join(import.meta.dirname, "..", "dist", "sitemap-index.xml");

let xml: string;

beforeAll(() => {
  if (!existsSync(DIST_SITEMAP_INDEX)) {
    throw new Error("dist/sitemap-index.xml not found — run `npm run build` first.");
  }
  xml = readFileSync(DIST_SITEMAP_INDEX, "utf-8");
});

describe("dist/sitemap-index.xml", () => {
  it("is a real sitemap index referencing at least one sitemap file", () => {
    expect(xml).toContain("<sitemapindex");
    expect(xml).toContain("<loc>");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && npx vitest run tests/sitemap.test.ts`
Expected: FAIL — `dist/sitemap-index.xml not found`

- [ ] **Step 3: Write the implementation**

```bash
npm install @astrojs/sitemap
```

Replace `astro.config.mjs` entirely:

```javascript
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  output: 'static',
  site: 'https://daily-dose-hazel-delta.vercel.app',
  integrations: [sitemap()],
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && npx vitest run`
Expected: PASS (full suite, one more than before)

- [ ] **Step 5: Commit**

```bash
git add astro.config.mjs package.json package-lock.json tests/sitemap.test.ts
git commit -m "feat(site): add XML sitemap via @astrojs/sitemap"
```

- [ ] **Step 6: Ship**

```bash
git checkout -b feat/sitemap
git push -u origin feat/sitemap
gh pr create --title "feat(site): add XML sitemap via @astrojs/sitemap"
gh pr checks --watch
gh pr merge --squash --delete-branch
```
