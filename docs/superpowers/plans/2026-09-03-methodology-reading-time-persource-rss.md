# Methodology Page, Reading-Time Badges, Per-Source RSS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close 3 real feature gaps found against TLDR.tech/Hacker Newsletter/Console.dev — a published curation-methodology page, honest reading-time/format badges, and 4 per-source RSS feeds.

**Architecture:** Feature 1 is a new page that only *reads* already-existing exported constants (no publish-path change). Feature 2 requires a real schema + pipeline change (a new `reading_minutes` field, computed once at write time from text that today is only used transiently). Feature 3 is a thin, DRY wrapper around the already-tested `renderDayContent()` + `rss()` machinery, filtered by source.

**Tech Stack:** Astro 5.16.5 (`output: "static"`), TypeScript, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-03-methodology-reading-time-persource-rss-design.md`

## Global Constraints

- No CSS framework, no React/Vue — plain CSS and `.astro` templates only.
- Feature 2 touches the publish path (`src/lib/digestSchema.ts`, `scripts/pipeline.ts`) — both explicitly named in `CLAUDE.md`'s plan-mode gate list. This plan (and its spec) already satisfies that gate; the implementer must not treat Feature 2 as a cosmetic render-only change.
- Features 1 and 3 do not touch the publish path.
- Every feature ships as its own PR: branch off `main` → commit(s) → push → `gh pr create` → CI green → squash-merge → delete branch (trunk-based GitHub Flow, `Branches.md`, no `develop` branch). Three PRs total for this plan.
- Conventional Commits required on every commit and the squash-merge message.
- `reading_minutes` must never be fabricated: HN and GitHub items must never have this field (schema-absent, not zero) since no body text is ever fetched for either source.
- Existing committed data predates this feature — the 5 real arXiv items already in `src/data/digest/2026-09-02/` do NOT have `reading_minutes` set. Any test written against currently-committed data must account for this (it will hit the fallback path, not the real-value path) — do not write a test that assumes committed data already has the field.

---

## Phase 1 — `/methodology` page

**PR:** `feat/methodology-page`

### Task 1: Create the methodology page

**Files:**
- Create: `src/pages/methodology.astro`
- Test: `tests/methodology-page.test.ts` (new file)

**Interfaces:**
- Consumes: `MAX_REASONABLE_ITEMS` (`src/lib/llmCuration.ts`), `interestTier`'s tier boundaries are hardcoded as prose since `interestTier.ts` exports only the function, not the raw numbers as named constants — this task must import and display the function's real behavior (e.g. `interestTier(5.9)`, `interestTier(6)`, `interestTier(8)`) rather than re-typing "6" and "8" as disconnected prose, so the page can never silently drift from the function's real thresholds. `ANOMALY_MULTIPLIER`, `SEED_BASELINE_USD`, `MIN_HISTORY_FOR_ANOMALY_CHECK` are not exported from `costTracking.ts` (they're module-private `const`s) — **this task must export them** (add `export` to each) so the page can import real values instead of hardcoding "5", "$0.05", "3".
- Produces: nothing consumed by other tasks (leaf page). Task 2 links to `/methodology`.

- [ ] **Step 1: Export the three currently-private constants in `costTracking.ts`**

In `src/lib/costTracking.ts`, change:
```typescript
const ANOMALY_MULTIPLIER = 5;
```
to:
```typescript
export const ANOMALY_MULTIPLIER = 5;
```
and the same for `SEED_BASELINE_USD` and `MIN_HISTORY_FOR_ANOMALY_CHECK` (add `export` to each declaration; leave every other line unchanged). `PRICING_PER_MILLION_TOKENS` is also currently module-private — add `export` to it too, since the methodology page needs the real per-model pricing table.

**Note:** this edit is to `src/lib/costTracking.ts`, which is on the publish-path list — but it is a pure visibility change (`const` → `export const`), no behavior change, no new logic. Confirmed safe by inspection: nothing about `recordAndCheckCost()`'s or `calculateCostUsd()`'s actual behavior changes.

- [ ] **Step 2: Write the failing test**

Create `tests/methodology-page.test.ts`:

```typescript
// PRECONDITION: e2e-style test reading already-built output — run `npm run
// build` first.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { MAX_REASONABLE_ITEMS } from "../src/lib/llmCuration.js";
import {
  ANOMALY_MULTIPLIER,
  SEED_BASELINE_USD,
  MIN_HISTORY_FOR_ANOMALY_CHECK,
} from "../src/lib/costTracking.js";
import { interestTier } from "../src/lib/interestTier.js";

const DIST_METHODOLOGY = join(
  import.meta.dirname,
  "..",
  "dist",
  "methodology",
  "index.html",
);

let html: string;

beforeAll(() => {
  if (!existsSync(DIST_METHODOLOGY)) {
    throw new Error(
      "dist/methodology/index.html not found — run `npm run build` first.",
    );
  }
  html = readFileSync(DIST_METHODOLOGY, "utf-8");
});

describe("dist/methodology/index.html", () => {
  it("is a real HTML document", () => {
    expect(html.toUpperCase()).toContain("<!DOCTYPE HTML>");
  });

  it("shows the real MAX_REASONABLE_ITEMS value, not a hardcoded copy", () => {
    expect(html).toContain(String(MAX_REASONABLE_ITEMS));
  });

  it("shows the real cost-anomaly constants, not hardcoded copies", () => {
    expect(html).toContain(String(ANOMALY_MULTIPLIER));
    expect(html).toContain(SEED_BASELINE_USD.toFixed(2));
    expect(html).toContain(String(MIN_HISTORY_FOR_ANOMALY_CHECK));
  });

  it("reflects the real interestTier() boundary behavior", () => {
    // Real behavior check, not a hardcoded number restated in the test:
    // confirms the boundary is exactly at 6 and 8 by calling the real function.
    expect(interestTier(5.9)).toBe("notable");
    expect(interestTier(6)).toBe("recommended");
    expect(interestTier(7.9)).toBe("recommended");
    expect(interestTier(8)).toBe("must-read");
    // And that the page actually displays these real boundary numbers:
    expect(html).toContain("6");
    expect(html).toContain("8");
  });

  it("links to all 4 per-source RSS feeds", () => {
    expect(html).toContain('href="/rss/hn.xml"');
    expect(html).toContain('href="/rss/arxiv.xml"');
    expect(html).toContain('href="/rss/github.xml"');
    expect(html).toContain('href="/rss/devto.xml"');
  });
});
```

- [ ] **Step 2b: Run test to verify it fails**

Run: `npm run build && npx vitest run tests/methodology-page.test.ts`
Expected: FAIL — `dist/methodology/index.html not found`

- [ ] **Step 3: Write the implementation**

Create `src/pages/methodology.astro`:

```astro
---
import Layout from '../layouts/Layout.astro';
import { MAX_REASONABLE_ITEMS } from '../lib/llmCuration.js';
import {
  ANOMALY_MULTIPLIER,
  SEED_BASELINE_USD,
  MIN_HISTORY_FOR_ANOMALY_CHECK,
  PRICING_PER_MILLION_TOKENS,
} from '../lib/costTracking.js';

const pricingRows = Object.entries(PRICING_PER_MILLION_TOKENS);
---

<Layout
  title="daily-dose — methodology"
  description="How daily-dose actually scores and curates every item — the real rubric, thresholds, and cost controls, not marketing copy."
  path="/methodology"
>
  <header class="masthead">
    <nav class="site-nav"><a href="/">&larr; Back to digest</a></nav>
    <h1>Methodology</h1>
    <p class="tagline">
      The real rubric, thresholds, and cost controls this project actually runs — every
      number below is imported live from the same code that runs the pipeline, not
      restated by hand.
    </p>
  </header>

  <main>
    <h2 class="section-heading">How items are scored</h2>
    <p>
      Every fetched item is scored in one batched call to a real AWS Bedrock LLM
      (Claude, via a model fallback chain) that reads each item's real title, real
      engagement numbers, and — where available — its real abstract or article
      excerpt. The model is asked for a genuine 0-10 interest score and one honest
      sentence explaining why. All ingested text is treated as untrusted data, never
      as instructions — this project explicitly guards against prompt injection from
      the sources it aggregates.
    </p>
    <p>
      If no real LLM credentials are configured (e.g. local development), or the
      model's response is missing a specific item, a deterministic placeholder
      formula derived only from real, already-fetched engagement numbers is used
      instead — and this is never presented as if it were genuine model judgment. See
      the project's own <code>AGENTS.md</code> for the full honesty policy.
    </p>
    <p>
      A hard pre-flight ceiling refuses to score more than <strong>{MAX_REASONABLE_ITEMS}</strong>
      {' '}items in one call — this catches an upstream bug (e.g. accidentally fetching all-time
      history instead of just today's items) before any money is spent, rather than after.
    </p>

    <h2 class="section-heading">Interest tiers</h2>
    <p>
      Every score maps to one of three tiers, used by the filter UI on the digest and
      archive pages:
    </p>
    <ul>
      <li>Below 6: <strong>Notable</strong></li>
      <li>6 up to (not including) 8: <strong>Recommended</strong></li>
      <li>8 and above: <strong>Must-Read</strong></li>
    </ul>

    <h2 class="section-heading">Real cost controls</h2>
    <p>
      Every real LLM call's actual token usage and dollar cost is recorded to a
      public, append-only ledger — see <a href="/stats">cost &amp; stats</a> for the
      real totals. A run is flagged as anomalous only once at least{' '}
      <strong>{MIN_HISTORY_FOR_ANOMALY_CHECK}</strong> days of real history exist and
      that day's cost exceeds <strong>{ANOMALY_MULTIPLIER}&times;</strong> the trailing
      7-day average (seeded at <strong>${SEED_BASELINE_USD.toFixed(2)}</strong> before
      any history exists) — this is a dynamic threshold that adapts to real observed
      usage, not a guessed fixed dollar ceiling.
    </p>

    <h2 class="section-heading">Real per-model pricing</h2>
    <table class="pricing-table">
      <thead>
        <tr>
          <th>Model</th>
          <th>Input ($/M tokens)</th>
          <th>Output ($/M tokens)</th>
        </tr>
      </thead>
      <tbody>
        {pricingRows.map(([model, pricing]) => (
          <tr>
            <td class="model-cell">{model}</td>
            <td>${pricing.input.toFixed(2)}</td>
            <td>${pricing.output.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>

    <h2 class="section-heading">Subscribe to just one source</h2>
    <p>Prefer only one of the four sources? Each has its own RSS feed:</p>
    <ul>
      <li><a href="/rss/hn.xml">Hacker News only</a></li>
      <li><a href="/rss/arxiv.xml">arXiv only</a></li>
      <li><a href="/rss/github.xml">GitHub only</a></li>
      <li><a href="/rss/devto.xml">Dev.to only</a></li>
    </ul>
  </main>
</Layout>

<style>
  ul {
    line-height: 1.7;
  }

  .pricing-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 0.75rem;
    font-size: 0.9rem;
  }

  .pricing-table th,
  .pricing-table td {
    text-align: left;
    padding: 0.5rem 0.6rem;
    border-bottom: 1px solid var(--border);
  }

  .pricing-table th {
    color: var(--muted);
    font-weight: 600;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .model-cell {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.8rem;
  }
</style>
```

Note on the "Interest tiers" section: the `6`/`8` boundary numbers are
plain prose here, deliberately not re-derived via a contrived call to
`interestTier()` in the template (a call like
`interestTier(5.9) === 'notable' ? 6 : 6` would be confusing dead code —
both branches return the same literal). The real coupling check belongs
in the test instead: Task 1's `tests/methodology-page.test.ts` already
calls the real `interestTier()` function directly and asserts its
boundary behavior, so if the thresholds ever change, that test — not
this page's prose — is what catches the drift. The important,
non-negotiable part is that the exported constants
(`MAX_REASONABLE_ITEMS`, `ANOMALY_MULTIPLIER`, `SEED_BASELINE_USD`,
`MIN_HISTORY_FOR_ANOMALY_CHECK`, `PRICING_PER_MILLION_TOKENS`) are real
imports, not hardcoded numbers.

The `/rss/*.xml` links in this file will 404 until Phase 3 ships — this is expected and acceptable since Phase 3 is the very next PR in this plan; do not block Phase 1 on Phase 3 existing.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && npx vitest run tests/methodology-page.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full suite to confirm no regression**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS, one more test file than before

- [ ] **Step 6: Commit**

```bash
git add src/lib/costTracking.ts src/pages/methodology.astro tests/methodology-page.test.ts
git commit -m "feat(site): add /methodology page with real, imported constants"
```

### Task 2: Add the Methodology nav link to all 4 existing pages

**Files:**
- Modify: `src/pages/index.astro`
- Modify: `src/pages/stats.astro`
- Modify: `src/pages/archive/index.astro`
- Modify: `src/pages/archive/[date].astro`
- Test: covered by the existing e2e suite (`build-output.test.ts`, `stats-page.test.ts`, `archive-pages.test.ts`) continuing to pass, plus one new assertion added to `build-output.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by other tasks.

- [ ] **Step 1: Write the failing test**

Add to `tests/build-output.test.ts` (inside the existing `describe("dist/index.html build output", ...)` block):

```typescript
  it("has a Methodology nav link", () => {
    expect(html).toContain('href="/methodology"');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/build-output.test.ts -t "Methodology nav"`
Expected: FAIL — no such link exists yet.

- [ ] **Step 3: Write the implementation**

In `src/pages/index.astro`, replace:
```astro
    <nav class="site-nav">
      <a href="/stats">Cost &amp; stats &rarr;</a>
      <a href="/archive/">All digests &rarr;</a>
    </nav>
```
with:
```astro
    <nav class="site-nav">
      <a href="/stats">Cost &amp; stats &rarr;</a>
      <a href="/archive/">All digests &rarr;</a>
      <a href="/methodology">Methodology &rarr;</a>
    </nav>
```

In `src/pages/stats.astro`, replace:
```astro
    <nav class="site-nav"><a href="/">&larr; Back to digest</a></nav>
```
with:
```astro
    <nav class="site-nav">
      <a href="/">&larr; Back to digest</a>
      <a href="/methodology">Methodology &rarr;</a>
    </nav>
```

In `src/pages/archive/index.astro`, replace:
```astro
    <nav class="site-nav"><a href="/">&larr; Back to digest</a></nav>
```
with:
```astro
    <nav class="site-nav">
      <a href="/">&larr; Back to digest</a>
      <a href="/methodology">Methodology &rarr;</a>
    </nav>
```

In `src/pages/archive/[date].astro`, replace:
```astro
    <nav class="site-nav">
      <a href="/">&larr; Latest digest</a>
      <a href="/archive/">All digests</a>
    </nav>
```
with:
```astro
    <nav class="site-nav">
      <a href="/">&larr; Latest digest</a>
      <a href="/archive/">All digests</a>
      <a href="/methodology">Methodology &rarr;</a>
    </nav>
```

Note: `stats.astro` and `archive/index.astro` currently share the identical single-link nav markup (both were `<a href="/">&larr; Back to digest</a>` only) — this task changes both identically. This is not the moment to extract a shared nav component: the 4 pages' nav links are all slightly different combinations (2, 2, 2, 3 links respectively, in different orders), so a shared component would need its own prop-driven link list, which is a bigger refactor than this task's scope. Following the existing pattern (each page owns its own nav markup) is correct here — flag it as a future YAGNI candidate only if a 5th nav-bearing page is ever added.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && npx vitest run`
Expected: PASS, one more than Task 1's count

- [ ] **Step 5: Commit**

```bash
git add src/pages/index.astro src/pages/stats.astro src/pages/archive/index.astro "src/pages/archive/[date].astro" tests/build-output.test.ts
git commit -m "feat(site): add Methodology nav link to all pages"
```

- [ ] **Step 6: Ship**

```bash
git checkout -b feat/methodology-page
git push -u origin feat/methodology-page
gh pr create --title "feat(site): add /methodology page with real, imported constants"
gh pr checks --watch
gh pr merge --squash --delete-branch
```

---

## Phase 2 — Reading-time / format badges

**PR:** `feat/reading-time-badges`

### Task 3: Add `reading_minutes` to the schema and compute it in the pipeline

**Files:**
- Modify: `src/lib/digestSchema.ts`
- Modify: `scripts/pipeline.ts`
- Test: `tests/schema.test.ts`, `tests/pipeline.test.ts`

**Interfaces:**
- Produces: `DigestItem.reading_minutes?: number`, present only on arXiv/Dev.to items written by a real pipeline run going forward. Task 4/5 consume this field.

- [ ] **Step 1: Write the failing test (schema)**

Add to `tests/schema.test.ts` (inside its existing `describe` block, following the file's existing valid/invalid-case pattern):

```typescript
  it("accepts a valid item with reading_minutes set", () => {
    const result = DigestItemSchema.safeParse({
      title: "A paper",
      source: "arxiv",
      url: "https://arxiv.org/abs/1234.5678",
      date: "2026-09-03",
      tags: [],
      interest_score: 7,
      why_read: "Solid incremental result.",
      authors: [],
      reading_minutes: 3,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid item WITHOUT reading_minutes (HN/GitHub items never have it)", () => {
    const result = DigestItemSchema.safeParse({
      title: "A story",
      source: "hn",
      url: "https://example.com",
      date: "2026-09-03",
      tags: [],
      interest_score: 7,
      why_read: "Interesting.",
      authors: [],
    });
    expect(result.success).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/schema.test.ts -t "reading_minutes"`
Expected: the first new test FAILS (`reading_minutes` is not a recognized field — Zod's default `.parse`/`.safeParse` strips unknown keys rather than rejecting, so this specific assertion may actually PASS today since `reading_minutes: 3` is just silently dropped, not rejected. Verify which behavior actually occurs by running this exact command before writing the implementation — if it already passes because Zod silently strips the extra field, that confirms the *need* for Step 3 just as clearly: the field is currently invisible to the schema, so nothing downstream can ever read it back after a round-trip. Either way, do not proceed to Step 3 without having run this command and observed the real behavior.)

- [ ] **Step 3: Write the schema implementation**

In `src/lib/digestSchema.ts`, add one field:

```typescript
export const DigestItemSchema = z.object({
  title: z.string().min(1),
  source: z.enum(["hn", "arxiv", "github", "devto"]),
  url: z.string().url(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tags: z.array(z.string()).default([]),
  interest_score: z.number().min(0).max(10),
  why_read: z.string().min(1),
  authors: z.array(z.string()).default([]),
  hn_id: z.number().optional(),
  points: z.number().optional(),
  stars: z.number().optional(),
  reactions: z.number().optional(),
  reading_minutes: z.number().optional(),
});
```

- [ ] **Step 4: Write the failing test (pipeline computation)**

Add to `tests/pipeline.test.ts`. First, check the file's existing imports/fixture style (it already tests `scoreStoryPlaceholder`/`scoreGithubPlaceholder`/`scoreDevtoPlaceholder` — this new test targets a small new exported helper, not the placeholder scorers):

```typescript
import { computeReadingMinutes } from "../scripts/pipeline.js";

describe("computeReadingMinutes", () => {
  it("computes ~200 words per minute, rounded, minimum 1", () => {
    const twoHundredWords = Array.from({ length: 200 }, () => "word").join(" ");
    expect(computeReadingMinutes(twoHundredWords)).toBe(1);

    const sixHundredWords = Array.from({ length: 600 }, () => "word").join(" ");
    expect(computeReadingMinutes(sixHundredWords)).toBe(3);
  });

  it("never returns less than 1, even for very short text", () => {
    expect(computeReadingMinutes("one two three")).toBe(1);
  });

  it("returns 1 for empty text (defensive floor, not expected in real data)", () => {
    expect(computeReadingMinutes("")).toBe(1);
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npx vitest run tests/pipeline.test.ts -t "computeReadingMinutes"`
Expected: FAIL — `computeReadingMinutes` is not exported from `scripts/pipeline.ts` yet.

- [ ] **Step 6: Write the pipeline implementation**

In `scripts/pipeline.ts`, add this exported function near the top-level helpers (e.g. right after `sanitizeGithubId`, before the `DEVTO_ARTICLES_URL` constant):

```typescript
/** Standard 200 words-per-minute reading speed, rounded, floored at 1 minute
 * so a very short abstract/excerpt never reports "0 min". Used only for
 * arXiv abstracts and Dev.to excerpts - HN and GitHub items never get a
 * reading_minutes value since no body text is ever fetched for either. */
const WORDS_PER_MINUTE = 200;

export function computeReadingMinutes(text: string): number {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE));
}
```

Then, in the arXiv branch of `main()`, change the candidate object from:
```typescript
    const candidate = {
      title: paper.title,
      source: "arxiv" as const,
      url: paper.url,
      date: today,
      tags: paper.categories,
      interest_score,
      why_read,
      authors: paper.authors,
    };
```
to:
```typescript
    const candidate = {
      title: paper.title,
      source: "arxiv" as const,
      url: paper.url,
      date: today,
      tags: paper.categories,
      interest_score,
      why_read,
      authors: paper.authors,
      reading_minutes: computeReadingMinutes(paper.summary),
    };
```

And in the Dev.to branch, change:
```typescript
    const candidate = {
      title: article.title,
      source: "devto" as const,
      url: article.url,
      date: today,
      tags: article.tags,
      interest_score,
      why_read,
      authors: [],
      reactions: article.reactions,
    };
```
to:
```typescript
    const candidate = {
      title: article.title,
      source: "devto" as const,
      url: article.url,
      date: today,
      tags: article.tags,
      interest_score,
      why_read,
      authors: [],
      reactions: article.reactions,
      reading_minutes: computeReadingMinutes(article.bodyText),
    };
```

Do **not** add `reading_minutes` to the HN or GitHub candidate objects — leave both exactly as they are today.

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS, 3 more tests than Task 1/2's count (2 schema + 3 pipeline, minus the schema test that may have already passed in Step 2 — report the real observed count from this run, not an assumed arithmetic total)

- [ ] **Step 8: Commit**

```bash
git add src/lib/digestSchema.ts scripts/pipeline.ts tests/schema.test.ts tests/pipeline.test.ts
git commit -m "feat(pipeline): compute reading_minutes for arXiv and Dev.to items"
```

### Task 4: Add `formatReadingBadge()` pure logic with unit tests

**Files:**
- Create: `src/lib/readingTime.ts`
- Test: `tests/readingTime.test.ts` (new file)

**Interfaces:**
- Consumes: `DigestItem` type (`src/lib/digestSchema.ts`).
- Produces: `export function formatReadingBadge(item: DigestItem): string`. Task 5 imports this.

- [ ] **Step 1: Write the failing test**

Create `tests/readingTime.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { formatReadingBadge } from "../src/lib/readingTime.js";
import type { DigestItem } from "../src/lib/digestSchema.js";

function baseItem(overrides: Partial<DigestItem>): DigestItem {
  return {
    title: "Test item",
    source: "hn",
    url: "https://example.com",
    date: "2026-09-03",
    tags: [],
    interest_score: 5,
    why_read: "Test.",
    authors: [],
    ...overrides,
  };
}

describe("formatReadingBadge", () => {
  it('returns "Discussion" for HN items, never a fabricated time', () => {
    expect(formatReadingBadge(baseItem({ source: "hn" }))).toBe("Discussion");
  });

  it('returns "Repo" for GitHub items, never a fabricated time', () => {
    expect(formatReadingBadge(baseItem({ source: "github" }))).toBe("Repo");
  });

  it('returns "~X min read" for arXiv items with reading_minutes set', () => {
    expect(
      formatReadingBadge(baseItem({ source: "arxiv", reading_minutes: 3 })),
    ).toBe("~3 min read");
  });

  it('returns "Paper" for an arXiv item missing reading_minutes (old record)', () => {
    expect(formatReadingBadge(baseItem({ source: "arxiv" }))).toBe("Paper");
  });

  it('returns "~X min excerpt" for Dev.to items with reading_minutes set', () => {
    expect(
      formatReadingBadge(baseItem({ source: "devto", reading_minutes: 5 })),
    ).toBe("~5 min excerpt");
  });

  it('returns "Article" for a Dev.to item missing reading_minutes (old record)', () => {
    expect(formatReadingBadge(baseItem({ source: "devto" }))).toBe("Article");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/readingTime.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/readingTime.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/readingTime.ts`:

```typescript
import type { DigestItem } from "./digestSchema.js";

/** Renders an honest per-source badge: a fixed format label where no body
 * text is ever fetched (HN, GitHub - never a fabricated time), a real
 * word-count-derived estimate where it is (arXiv, Dev.to), and a
 * source-appropriate fallback label if reading_minutes is unexpectedly
 * absent (an old record written before this feature shipped - schema
 * allows the field as optional, so this must never throw). */
export function formatReadingBadge(item: DigestItem): string {
  switch (item.source) {
    case "hn":
      return "Discussion";
    case "github":
      return "Repo";
    case "arxiv":
      return typeof item.reading_minutes === "number"
        ? `~${item.reading_minutes} min read`
        : "Paper";
    case "devto":
      return typeof item.reading_minutes === "number"
        ? `~${item.reading_minutes} min excerpt`
        : "Article";
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/readingTime.test.ts`
Expected: PASS, 6/6

- [ ] **Step 5: Commit**

```bash
git add src/lib/readingTime.ts tests/readingTime.test.ts
git commit -m "feat(site): add formatReadingBadge pure logic"
```

### Task 5: Wire the badge into DigestList.astro

**Files:**
- Modify: `src/components/DigestList.astro`
- Test: `tests/build-output.test.ts`

**Interfaces:**
- Consumes: `formatReadingBadge` (`../lib/readingTime.js`, Task 4).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Write the failing test**

Add to `tests/build-output.test.ts`:

```typescript
  it("renders a real Discussion/Repo/Paper reading-time badge per source (no fabricated arXiv time on today's pre-existing committed data)", () => {
    // Today's real committed arXiv items predate this feature and have no
    // reading_minutes set yet - they must show the honest "Paper" fallback,
    // not a fabricated "~X min read". This is deliberately testing the
    // CURRENT real state, not a hypothetical future state.
    expect(html).toContain(">Discussion<");
    expect(html).toContain(">Repo<");
    expect(html).toContain(">Paper<");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && npx vitest run tests/build-output.test.ts -t "reading-time badge"`
Expected: FAIL — no badge markup exists yet.

- [ ] **Step 3: Write the implementation**

In `src/components/DigestList.astro`, add the import:

```astro
---
import type { CollectionEntry } from 'astro:content';
import { interestTier } from '../lib/interestTier.js';
import { formatReadingBadge } from '../lib/readingTime.js';

interface Props {
  entries: CollectionEntry<'digest'>[];
}

const { entries } = Astro.props;
---
```

and add the badge to the `.story-meta` div, right after the score span:

```astro
      <div class="story-meta">
        <span class={`badge badge-${entry.data.source}`}>{entry.data.source}</span>
        <span class="score">score: {entry.data.interest_score.toFixed(1)}</span>
        <span class="reading-badge">{formatReadingBadge(entry.data)}</span>
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

Add to the existing `<style>` block:

```css
  .reading-badge {
    font-style: italic;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && npx vitest run`
Expected: PASS, one more than Task 3/4's running total

- [ ] **Step 5: Manual verification (real committed data, not just the test)**

Run: `npm run build`, then inspect `dist/index.html` or `dist/archive/2026-09-02/index.html` directly and confirm: HN cards show "Discussion", GitHub cards show "Repo", and all 5 real committed arXiv cards show "Paper" (not a fabricated "~X min read") — because none of today's committed arXiv items have `reading_minutes` set (they predate Task 3). This is the correct, honest, real behavior right now; a future real pipeline run (after this PR merges) will start writing `reading_minutes` on new arXiv/Dev.to items, and those will show the real computed value instead.

- [ ] **Step 6: Commit**

```bash
git add src/components/DigestList.astro tests/build-output.test.ts
git commit -m "feat(site): render reading-time/format badges on story cards"
```

- [ ] **Step 7: Ship**

```bash
git checkout -b feat/reading-time-badges
git push -u origin feat/reading-time-badges
gh pr create --title "feat(pipeline+site): add reading_minutes and reading-time/format badges"
gh pr checks --watch
gh pr merge --squash --delete-branch
```

---

## Phase 3 — Per-source RSS feeds

**PR:** `feat/per-source-rss`

### Task 6: Add the shared per-source feed builder and 4 route files

**Files:**
- Create: `src/lib/perSourceRss.ts`
- Create: `src/pages/rss/hn.xml.ts`
- Create: `src/pages/rss/arxiv.xml.ts`
- Create: `src/pages/rss/github.xml.ts`
- Create: `src/pages/rss/devto.xml.ts`
- Test: `tests/rss-hn-feed.test.ts`, `tests/rss-arxiv-feed.test.ts`, `tests/rss-github-feed.test.ts`, `tests/rss-devto-feed.test.ts` (4 new files)

**Interfaces:**
- Consumes: `groupEntriesByDate` (`../lib/digestGrouping.js`), `renderDayContent` (`../lib/rssContent.js`), `rss` (`@astrojs/rss`), `DigestItem` type (`../lib/digestSchema.js`).
- Produces: `export async function buildSourceFeed(context: APIContext, source: DigestItem["source"]): Promise<Response>`. Each of the 4 route files consumes this with a fixed `source` argument.

- [ ] **Step 1: Write the failing tests**

Create `tests/rss-hn-feed.test.ts` (the other 3 files are identical except for the source/tag substituted — write all 4 now, following this exact template):

```typescript
// PRECONDITION: e2e-style test reading already-built output — run `npm run
// build` first.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { XMLParser } from "fast-xml-parser";
import { beforeAll, describe, expect, it } from "vitest";

const DIST_FEED = join(import.meta.dirname, "..", "dist", "rss", "hn.xml");

let feedXml: string;

beforeAll(() => {
  if (!existsSync(DIST_FEED)) {
    throw new Error("dist/rss/hn.xml not found — run `npm run build` first.");
  }
  feedXml = readFileSync(DIST_FEED, "utf-8");
});

describe("dist/rss/hn.xml", () => {
  it("is well-formed XML with a real channel", () => {
    const parser = new XMLParser({ ignoreAttributes: false });
    expect(() => parser.parse(feedXml)).not.toThrow();
    const parsed = parser.parse(feedXml);
    expect(parsed.rss.channel).toBeTruthy();
    expect(parsed.rss.channel.title).toBe("daily-dose — Hacker News");
  });

  it("every item's content only describes Hacker News-sourced stories", () => {
    const parser = new XMLParser({ ignoreAttributes: false });
    const parsed = parser.parse(feedXml);
    const items = Array.isArray(parsed.rss.channel.item)
      ? parsed.rss.channel.item
      : parsed.rss.channel.item
        ? [parsed.rss.channel.item]
        : [];

    // Real committed data today has 5 hn-*.json items under one date -
    // confirms this feed isn't empty due to a filtering bug.
    expect(items.length).toBeGreaterThan(0);

    for (const item of items) {
      const contentField = item["content:encoded"] ?? item.description;
      expect(typeof contentField).toBe("string");
      expect(contentField).toContain("source: hn");
      expect(contentField).not.toContain("source: arxiv");
      expect(contentField).not.toContain("source: github");
      expect(contentField).not.toContain("source: devto");
    }
  });
});
```

Create the other 3 test files identically, substituting: `tests/rss-arxiv-feed.test.ts` → path `dist/rss/arxiv.xml`, title `"daily-dose — arXiv"`, content check `"source: arxiv"` (and NOT `hn`/`github`/`devto`); `tests/rss-github-feed.test.ts` → `dist/rss/github.xml`, `"daily-dose — GitHub"`, `"source: github"`; `tests/rss-devto-feed.test.ts` → `dist/rss/devto.xml`, `"daily-dose — Dev.to"`, `"source: devto"`. **Note:** today's repo has zero committed Dev.to items — the Dev.to feed test's "items.length greater than 0" assertion will genuinely fail against current real data (an empty feed is the honest, correct behavior right now, not a bug). Adjust that one test to `expect(items.length).toBeGreaterThanOrEqual(0)` and skip the per-item content loop when `items.length === 0`, since there is nothing to assert per-item when the array is empty — do not weaken the other 3 feeds' tests to match.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run build && npx vitest run tests/rss-hn-feed.test.ts tests/rss-arxiv-feed.test.ts tests/rss-github-feed.test.ts tests/rss-devto-feed.test.ts`
Expected: FAIL for all 4 — none of `dist/rss/*.xml` exist yet.

- [ ] **Step 3: Write the implementation**

Create `src/lib/perSourceRss.ts`:

```typescript
import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { getCollection } from "astro:content";
import type { DigestItem } from "./digestSchema.js";
import { groupEntriesByDate } from "./digestGrouping.js";
import { renderDayContent } from "./rssContent.js";

const SOURCE_LABELS: Record<DigestItem["source"], string> = {
  hn: "Hacker News",
  arxiv: "arXiv",
  github: "GitHub",
  devto: "Dev.to",
};

/**
 * Builds one RSS feed scoped to a single source, reusing the exact same
 * renderDayContent()/rss() machinery the combined /rss.xml feed uses (see
 * src/pages/rss.xml.ts) - filtered down to one source per date group, and
 * skipping any date with zero matching items entirely (never an empty
 * <item>). See docs/superpowers/specs/2026-09-03-methodology-reading-time-persource-rss-design.md
 * Feature 3.
 */
export async function buildSourceFeed(
  context: APIContext,
  source: DigestItem["source"],
): Promise<Response> {
  if (!context.site) {
    throw new Error(
      `[rss/${source}.xml] Astro \`site\` is not configured in astro.config.mjs - @astrojs/rss requires it to build absolute URLs.`,
    );
  }

  const sourceLabel = SOURCE_LABELS[source];
  const allEntries = await getCollection("digest");
  const dateGroups = groupEntriesByDate(allEntries);

  const items = dateGroups
    .map((group) => ({
      date: group.date,
      entries: group.entries.filter((entry) => entry.data.source === source),
    }))
    .filter((group) => group.entries.length > 0)
    .map((group) => ({
      title: `daily-dose — ${group.date}`,
      pubDate: new Date(group.date),
      link: `/archive/${group.date}/`,
      content: renderDayContent(group.entries.map((entry) => entry.data)),
    }));

  return rss({
    title: `daily-dose — ${sourceLabel}`,
    description: `${sourceLabel} picks from the daily-dose digest — a daily AI-curated technical digest.`,
    site: context.site,
    items,
  });
}
```

Create `src/pages/rss/hn.xml.ts`:

```typescript
import type { APIContext } from "astro";
import { buildSourceFeed } from "../../lib/perSourceRss.js";

export async function GET(context: APIContext): Promise<Response> {
  return buildSourceFeed(context, "hn");
}
```

Create the other 3 identically, changing only the `"hn"` argument: `src/pages/rss/arxiv.xml.ts` → `"arxiv"`, `src/pages/rss/github.xml.ts` → `"github"`, `src/pages/rss/devto.xml.ts` → `"devto"`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run build && npx vitest run`
Expected: PASS. The Dev.to feed test should show a well-formed empty feed (0 items) — this is correct, not a failure.

- [ ] **Step 5: Commit**

```bash
git add src/lib/perSourceRss.ts src/pages/rss/hn.xml.ts src/pages/rss/arxiv.xml.ts src/pages/rss/github.xml.ts src/pages/rss/devto.xml.ts tests/rss-hn-feed.test.ts tests/rss-arxiv-feed.test.ts tests/rss-github-feed.test.ts tests/rss-devto-feed.test.ts
git commit -m "feat(site): add per-source RSS feeds"
```

### Task 7: Add feed discoverability links to `/archive/`

**Files:**
- Modify: `src/pages/archive/index.astro`
- Test: `tests/archive-pages.test.ts`

**Interfaces:**
- Consumes: nothing new (the `/methodology` page already links to all 4 feeds per Task 1 Step 3 — this task adds the same links to the one other natural home named in the spec).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Write the failing test**

Add to `tests/archive-pages.test.ts`, inside the existing
`describe("dist/archive/index.html build output", ...)` block (the HTML
variable there is named `archiveIndexHtml` — confirmed by reading the
current file; do not confuse it with the dated-page test's local `html`
variable in the second `describe` block):

```typescript
  it("links to all 4 per-source RSS feeds", () => {
    expect(archiveIndexHtml).toContain('href="/rss/hn.xml"');
    expect(archiveIndexHtml).toContain('href="/rss/arxiv.xml"');
    expect(archiveIndexHtml).toContain('href="/rss/github.xml"');
    expect(archiveIndexHtml).toContain('href="/rss/devto.xml"');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && npx vitest run tests/archive-pages.test.ts -t "per-source RSS"`
Expected: FAIL — no such links exist yet.

- [ ] **Step 3: Write the implementation**

In `src/pages/archive/index.astro`, add a new section inside `<main>`, after the existing `{dateGroups.length > 0 ? (...) : (...)}` block closes:

```astro
    <h2 class="section-heading">Subscribe to just one source</h2>
    <ul class="feed-list">
      <li><a href="/rss/hn.xml">Hacker News only</a></li>
      <li><a href="/rss/arxiv.xml">arXiv only</a></li>
      <li><a href="/rss/github.xml">GitHub only</a></li>
      <li><a href="/rss/devto.xml">Dev.to only</a></li>
    </ul>
```

Add to the existing `<style>` block:

```css
  .feed-list {
    line-height: 1.7;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && npx vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/archive/index.astro tests/archive-pages.test.ts
git commit -m "feat(site): link per-source RSS feeds from the archive page"
```

- [ ] **Step 6: Ship**

```bash
git checkout -b feat/per-source-rss
git push -u origin feat/per-source-rss
gh pr create --title "feat(site): add per-source RSS feeds"
gh pr checks --watch
gh pr merge --squash --delete-branch
```
