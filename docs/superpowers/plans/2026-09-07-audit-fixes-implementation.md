# Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 7 confirmed findings from the 2026-09-06/07 daily-dose E2E audit — a `/stats` mobile-overflow bug, two missing `:focus-visible` rules plus a global fallback, a favicon cross-origin console error, an accessibility polish item, and a Chart.js mobile-collapse bug.

**Architecture:** Seven small, independent, non-conflicting presentation-layer diffs across 7 files. No shared state between tasks except that Tasks 1 and 6 touch the same file (`stats.astro`) sequentially. TDD throughout: write/extend the failing test first, then the minimal fix.

**Tech Stack:** Astro 5 (static site, one page on-demand/SSR), TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-07-audit-fixes-design.md` — read it alongside this plan; it has the research citations and rationale behind each fix. This plan corrects two things the spec got wrong after deeper verification against the real test suite (both explained in Task 1 and Task 5 below): `/stats` has no static build output to test against (it's on-demand SSR — its tests read the `.astro` source directly), and Fix 5's favicon check adds an extra `fetch()` call that several *other*, pre-existing tests' call-count assertions don't expect.

## Global Constraints

- Minimal, surgical diffs only — no refactoring beyond what each fix needs.
- No new npm dependency.
- None of these 7 tasks touch `scripts/pipeline.ts`, `src/lib/llmCuration.ts`, `src/lib/curation.ts`, `src/lib/costTracking.ts`, or `src/lib/digestSchema.ts` — CLAUDE.md's publish-path plan-mode gate does not apply.
- **Do not push, open a PR, or merge to `main` at any point in this plan.** Every task ends with a local commit only. The final section explicitly stops before any remote action and waits for the user's separate go-ahead.
- One branch, `fix/audit-findings`, created once at the start; 7 commits, one per task, in the order below.

---

## Setup (run once, before Task 1)

```bash
cd /Users/sairamugge/Desktop/Not-Humans-World/daily-dose
git status --porcelain  # confirm clean before branching (untracked .playwright-mcp/*.png and the spec file are fine to leave — not part of this work)
git checkout -b fix/audit-findings main
npm test    # confirm a clean baseline before any changes
npm run build
```
Expected: tests pass, build succeeds, on a new branch `fix/audit-findings` with `main` as its base.

---

### Task 1: `/stats` — wrap both cost tables in a scrollable, keyboard-accessible region

**Files:**
- Modify: `src/pages/stats.astro:120-167` (markup), `:245-252` (CSS)
- Test: `tests/stats-page.test.ts` (existing file — **not** `tests/build-output.test.ts`)

**Why this test file and not `build-output.test.ts`:** `/stats` sets `export const prerender = false` (it's gated by Basic Auth in `src/middleware.ts`), so `astro build` never emits a static `dist/client/stats/index.html` to read. `tests/stats-page.test.ts` already documents this in its header comment and has an established convention for exactly this situation: read `stats.astro`'s raw source text via `readFileSync` and assert on the source string directly, inside its existing `describe("stats.astro source structure", ...)` block (starts at line 146, uses a `const source = readFileSync(STATS_ASTRO_SOURCE, "utf-8");` already in scope for every `it` in that block).

**Interfaces:**
- Consumes: none (pure markup/CSS change).
- Produces: `.table-scroll` CSS class and `.stats-table` gets `min-width: 32rem` — Task 6 also edits this same file's `<th>` elements inside the tables this task wraps, so land this task first.

- [ ] **Step 1: Write the failing test**

Add these two `it` blocks inside the existing `describe("stats.astro source structure", ...)` block in `tests/stats-page.test.ts` (after the last existing `it`, before the closing `});` of that describe block):

```ts
  it("(audit fix) wraps both stats tables in a scrollable, keyboard-accessible region", () => {
    expect(source).toMatch(
      /<div class="table-scroll" tabindex="0" role="region" aria-label="Model cost breakdown, scrollable">\s*<table class="stats-table">/,
    );
    expect(source).toMatch(
      /<div class="table-scroll" tabindex="0" role="region" aria-label="Daily cost breakdown, scrollable">\s*<table class="stats-table">/,
    );
    expect(source).toMatch(/\.table-scroll\s*\{[^}]*overflow-x:\s*auto/);
    expect(source).toMatch(/\.stats-table\s*\{[^}]*min-width:\s*32rem/);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/stats-page.test.ts -t "wraps both stats tables"`
Expected: FAIL — none of the four assertions match yet.

- [ ] **Step 3: Write minimal implementation**

In `src/pages/stats.astro`, the current markup (lines 118-167) is:

```astro
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
```

Wrap each `<table class="stats-table">...</table>` in its own labeled scroll region (only the two lines with `<table` and `</table>` change — everything inside stays identical):

```astro
        <h2 class="section-heading">By model</h2>
        <div class="table-scroll" tabindex="0" role="region" aria-label="Model cost breakdown, scrollable">
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
        </div>

        <h2 class="section-heading">By day</h2>
        <div class="table-scroll" tabindex="0" role="region" aria-label="Daily cost breakdown, scrollable">
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
        </div>
```

In the `<style>` block, the current `.stats-table` rule (lines 245-252) is:

```css
  .stats-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 0.75rem;
    font-size: 0.9rem;
    background: var(--bg-surface);
    font-family: var(--font-body);
  }
```

Change to (add `min-width`, add the new `.table-scroll` rule immediately above it):

```css
  .table-scroll {
    overflow-x: auto;
  }

  .stats-table {
    width: 100%;
    min-width: 32rem;
    border-collapse: collapse;
    margin-top: 0.75rem;
    font-size: 0.9rem;
    background: var(--bg-surface);
    font-family: var(--font-body);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/stats-page.test.ts`
Expected: PASS (all tests in this file, including the new one and every pre-existing one — this file has zero build-output dependency so no `npm run build` is needed before running it).

- [ ] **Step 5: Commit**

```bash
git add src/pages/stats.astro tests/stats-page.test.ts
git commit -m "fix(stats): wrap cost tables in a scrollable region to stop page-wide mobile overflow"
```

---

### Task 2: `.preview-date` (archive index) — add missing `:focus-visible`

**Files:**
- Modify: `src/components/DigestPreviewCard.astro:35-45`
- Test: `tests/archive-preview-cards.test.ts` (existing file, existing `html`/`beforeAll` already loads `dist/client/archive/index.html`)

**Interfaces:**
- Consumes: none.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

`tests/archive-preview-cards.test.ts` does not currently import `readAllPageCss`. Change its import line from:
```ts
import { DIST_DIR } from "./testUtils.js";
```
to:
```ts
import { DIST_DIR, readAllPageCss } from "./testUtils.js";
```

Then add this `it` inside the existing `describe("archive preview cards", ...)` block:

```ts
  it("(audit fix) .preview-date has a :focus-visible rule matching the site's accent pattern", () => {
    const style = readAllPageCss(html);
    expect(style).toMatch(
      /\.preview-date:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/,
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && npx vitest run tests/archive-preview-cards.test.ts -t "focus-visible"`
Expected: FAIL — no `.preview-date:focus-visible` rule exists yet.

- [ ] **Step 3: Write minimal implementation**

In `src/components/DigestPreviewCard.astro`, the current `.preview-date` rules (lines 35-45) are:

```css
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
```

Add a `:focus-visible` rule immediately after `:hover`:

```css
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

  .preview-date:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && npx vitest run tests/archive-preview-cards.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/DigestPreviewCard.astro tests/archive-preview-cards.test.ts
git commit -m "fix(a11y): add missing :focus-visible outline to archive-index date links"
```

---

### Task 3: `archive/[date].astro`'s `.date-nav a` (Older/Newer) — add missing `:focus-visible`

**Files:**
- Modify: `src/pages/archive/[date].astro:90-97`
- Test: `tests/archive-pages.test.ts` (existing file)

**Interfaces:**
- Consumes: none.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

`tests/archive-pages.test.ts` does not currently import `readAllPageCss`. Change its import line from:
```ts
import { DIST_DIR } from "./testUtils.js";
```
to:
```ts
import { DIST_DIR, readAllPageCss } from "./testUtils.js";
```

The file already has this block (around line 114-120), reading a specific date page's HTML on demand:

```ts
  if (committedDates.length > 0) {
    const [firstDate] = committedDates;

    it(`renders a static page for ${firstDate} containing a real story title from that date`, () => {
      const datePagePath = join(DIST_ARCHIVE_BASE, firstDate, "index.html");
```

Add a new `it` immediately after that existing one, still inside the same `if (committedDates.length > 0) { const [firstDate] = committedDates; ... }` block so `firstDate` is in scope:

```ts
    it("(audit fix) .date-nav a has a :focus-visible rule matching the site's accent pattern", () => {
      const datePagePath = join(DIST_ARCHIVE_BASE, firstDate, "index.html");
      const html = readFileSync(datePagePath, "utf-8");
      const style = readAllPageCss(html);
      expect(style).toMatch(
        /\.date-nav a:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/,
      );
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && npx vitest run tests/archive-pages.test.ts -t "focus-visible"`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

In `src/pages/archive/[date].astro`, the current `.date-nav a` rules (lines 90-97) are:

```css
  .date-nav a {
    color: var(--accent);
    text-decoration: none;
  }

  .date-nav a:hover {
    text-decoration: underline;
  }
```

Add a `:focus-visible` rule immediately after `:hover`:

```css
  .date-nav a {
    color: var(--accent);
    text-decoration: none;
  }

  .date-nav a:hover {
    text-decoration: underline;
  }

  .date-nav a:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && npx vitest run tests/archive-pages.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/archive/[date].astro tests/archive-pages.test.ts
git commit -m "fix(a11y): add missing :focus-visible outline to archive date-page Older/Newer links"
```

---

### Task 4: `Layout.astro` — add a global `:focus-visible` fallback

**Files:**
- Modify: `src/layouts/Layout.astro:109-111` (insert point — right after the existing `* { box-sizing: border-box; }` rule, before every more-specific component rule)
- Test: `tests/build-output.test.ts` (existing file, existing `html`/`beforeAll` already loads `dist/client/index.html`; already imports `readAllPageCss`)

**Why this insert point:** `Layout.astro`'s `<style is:global>` block already contains two later, more-specific `:focus-visible` rules (`.site-nav a:focus-visible` at line 224, `.site-footer-links a:focus-visible` at line 364). Placing the new global fallback right after the `*` reset — before any of those — documents that it's the *base* every more-specific rule overrides, matching this file's own existing top-to-bottom "reset, then increasingly specific" structure. It must live inside this existing `is:global` block, not a new scoped `<style>`: Astro's scoped-CSS mechanism only adds its scoping attribute to elements a component renders directly in its own template, never to `<slot />` content from child components — a plain scoped rule here would never match an `<a>`/`<button>` rendered by `DigestPreviewCard.astro`, `StoryCard.astro`, etc., which is the entire point of this fallback.

**Interfaces:**
- Consumes: none.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Add this `it` anywhere inside `tests/build-output.test.ts` at the top level (not nested in an unrelated `describe`):

```ts
describe("global :focus-visible fallback (audit fix)", () => {
  it("Layout.astro defines a global :focus-visible fallback ahead of per-component overrides", () => {
    const style = readAllPageCss(html);
    expect(style).toMatch(
      /(?<![\w\]]):focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && npx vitest run tests/build-output.test.ts -t "global :focus-visible fallback"`
Expected: FAIL — the lookbehind `(?<![\w\]])` requires a bare `:focus-visible` selector not immediately preceded by a word character or `]` (i.e. not part of `.site-nav a:focus-visible` or an Astro-scoped `[data-astro-cid-*]:focus-visible` rule), which doesn't exist yet. (Note: an earlier draft of this regex used `(?<!\S)`, which breaks against minified build output — real Astro CSS minification collapses the preceding rule's closing `}` directly against the next selector with no whitespace, e.g. `border-box}:focus-visible{...}`, and `}` is non-whitespace, so `(?<!\S)` would never match. `(?<![\w\]])` correctly allows `}` while still excluding compound selectors.)

- [ ] **Step 3: Write minimal implementation**

In `src/layouts/Layout.astro`, the current reset (lines 109-111) is:

```css
      * {
        box-sizing: border-box;
      }
```

Add the fallback rule immediately after it:

```css
      * {
        box-sizing: border-box;
      }

      :focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && npx vitest run tests/build-output.test.ts`
Expected: PASS (all tests in this file — this is a shared layout change, so re-run the whole file, not just the new test, to catch any unexpected interaction with existing CSS assertions elsewhere in this large file).

- [ ] **Step 5: Commit**

```bash
git add src/layouts/Layout.astro tests/build-output.test.ts
git commit -m "fix(a11y): add global :focus-visible fallback so a missed per-component rule still gets an accessible outline"
```

---

### Task 5: Favicon cross-origin console error — verify reachability before persisting `favicon_url`

**Files:**
- Modify: `src/lib/imageResolution.ts:189-266` (the `isImageUrlReachable` function and `resolveItemImage`'s success-path return)
- Test: `tests/imageResolution.test.ts` (existing file — extensive changes; read carefully, this is the most involved task in the plan)

**Why this is the most involved task:** `isImageUrlReachable` currently only checks `response.ok`. This task adds a `response.headers.get("cross-origin-resource-policy")` check — which means the function now touches `.headers` on every response that passes the `ok` check. Any existing test that mocks a HEAD-check response as a bare `{ ok: true }` (no `.headers` property) will make the new code throw a `TypeError` reading `.headers.get`, which the function's own `try/catch` silently converts into `return false` — turning a previously-"reachable" mock into an incorrectly-"unreachable" one. Separately, `favicon_url` now goes through its own `verifyImageReachable()` call, which is a **second, additional `fetch()` call** beyond what existed before — any test asserting an exact `toHaveBeenCalledTimes(N)` needs `N` incremented, and any test whose mocked page HTML has no `<link rel="icon">` (meaning `extractFavicon` falls through to the Google favicon-service URL, which is always truthy) needs an extra mock queued for that call. Below is the exact, verified-line-by-line set of changes — this list was produced by manually tracing every `resolveItemImage`-based test in the file against the new code path, not guessed.

**Interfaces:**
- Consumes: none.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing tests — update existing mocks/assertions**

In `tests/imageResolution.test.ts`, make these exact changes (each is a distinct existing `it` block; line numbers are as of this plan's writing and may drift by a line or two if earlier tasks' diffs land first — none of them touch this file, so they won't):

**1a. Test at line 190, `"resolves image_url and favicon_url from a successful fetch"`** — currently:
```ts
  it("resolves image_url and favicon_url from a successful fetch", async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<meta property="og:image" content="https://example.com/cover.png"><link rel="icon" href="/f.ico">`,
      })
      .mockResolvedValueOnce({ ok: true }); // the HEAD check

    const result = await resolveItemImage("https://example.com/article");
    expect(result.image_url).toBe("https://example.com/cover.png");
    expect(result.favicon_url).toBe("https://example.com/f.ico");
  });
```
Change to (add `headers` to the existing HEAD-check mock, add a third mock for the favicon's own HEAD check — the test HTML has a real `<link rel="icon">`, so `favicon_url` is a real URL that now needs its own reachability check):
```ts
  it("resolves image_url and favicon_url from a successful fetch", async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<meta property="og:image" content="https://example.com/cover.png"><link rel="icon" href="/f.ico">`,
      })
      .mockResolvedValueOnce({ ok: true, headers: { get: () => null } }) // the image HEAD check
      .mockResolvedValueOnce({ ok: true, headers: { get: () => null } }); // the favicon HEAD check

    const result = await resolveItemImage("https://example.com/article");
    expect(result.image_url).toBe("https://example.com/cover.png");
    expect(result.favicon_url).toBe("https://example.com/f.ico");
  });
```

**1b. Test at line 218, `"calls fetch with an abort signal and the expected User-Agent header"`** — currently:
```ts
  it("calls fetch with an abort signal and the expected User-Agent header", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      text: async () => "<html></html>",
    });

    await resolveItemImage("https://example.com/article");
```
Change to (this test's HTML has no `og:image` and no `<link rel="icon">`, so `extractFavicon` falls through to the Google favicon-service URL — always truthy — which now triggers its own HEAD check; add that mock so the call isn't left relying on the mock queue running dry):
```ts
  it("calls fetch with an abort signal and the expected User-Agent header", async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => "<html></html>",
      })
      .mockResolvedValueOnce({ ok: true, headers: { get: () => null } }); // the favicon (Google fallback) HEAD check

    await resolveItemImage("https://example.com/article");
```
(The rest of this test — the `expect(fetch).toHaveBeenCalledWith(...)` assertion — is unchanged; it checks the *first* call's arguments, which this change doesn't affect.)

**1c. Test at line 332, `"falls back to the arXiv figure when the primary og:image is rejected as generic"`** — currently:
```ts
  it("falls back to the arXiv figure when the primary og:image is rejected as generic", async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<meta property="og:image" content="https://arxiv.org/static/browse/0.3.4/images/arxiv-logo-fb.png">`,
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<figure><img src="/html/2609.04190/fig1.png"></figure>`,
      })
      .mockResolvedValueOnce({ ok: true }); // the HEAD check
```
Change the third mock to add `headers`, and add a fourth mock for the favicon check (this test's page HTML has no `<link rel="icon">`, so it's the Google-fallback path again):
```ts
  it("falls back to the arXiv figure when the primary og:image is rejected as generic", async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<meta property="og:image" content="https://arxiv.org/static/browse/0.3.4/images/arxiv-logo-fb.png">`,
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<figure><img src="/html/2609.04190/fig1.png"></figure>`,
      })
      .mockResolvedValueOnce({ ok: true, headers: { get: () => null } }) // the ar5iv figure's HEAD check
      .mockResolvedValueOnce({ ok: true, headers: { get: () => null } }); // the favicon (Google fallback) HEAD check
```
(The rest of the test is unchanged.)

**1d. Test at line 355, `"does not attempt the arXiv fallback when no arxivId is given"`** — currently:
```ts
  it("does not attempt the arXiv fallback when no arxivId is given", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      text: async () =>
        `<meta property="og:image" content="https://arxiv.org/static/browse/0.3.4/images/arxiv-logo-fb.png">`,
    });

    const result = await resolveItemImage("https://arxiv.org/abs/2609.04190");
    expect(result.image_url).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
```
Change to (this test's `og:image` is rejected as generic and no `arxivId` is given, so `image_url`'s own check never calls `fetch` at all — but the favicon check still does, via the Google fallback, since this test's HTML has no `<link rel="icon">`; that's a real second `fetch` call, so the count assertion must become `2`):
```ts
  it("does not attempt the arXiv fallback when no arxivId is given", async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<meta property="og:image" content="https://arxiv.org/static/browse/0.3.4/images/arxiv-logo-fb.png">`,
      })
      .mockResolvedValueOnce({ ok: true, headers: { get: () => null } }); // the favicon (Google fallback) HEAD check

    const result = await resolveItemImage("https://arxiv.org/abs/2609.04190");
    expect(result.image_url).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
```

**1e. Test at line 367, `"still returns undefined image_url when the arXiv fallback also finds nothing"`** — currently:
```ts
  it("still returns undefined image_url when the arXiv fallback also finds nothing", async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<meta property="og:image" content="https://arxiv.org/static/browse/0.3.4/images/arxiv-logo-fb.png">`,
      })
      .mockResolvedValueOnce({ ok: true, text: async () => "<html></html>" });

    const result = await resolveItemImage(
      "https://arxiv.org/abs/2609.04190",
      "2609.04190",
    );
    expect(result.image_url).toBeUndefined();
  });
```
Change to (add a third mock for the favicon check — the first page's HTML has no `<link rel="icon">`, so it's the Google-fallback path):
```ts
  it("still returns undefined image_url when the arXiv fallback also finds nothing", async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<meta property="og:image" content="https://arxiv.org/static/browse/0.3.4/images/arxiv-logo-fb.png">`,
      })
      .mockResolvedValueOnce({ ok: true, text: async () => "<html></html>" })
      .mockResolvedValueOnce({ ok: true, headers: { get: () => null } }); // the favicon (Google fallback) HEAD check

    const result = await resolveItemImage(
      "https://arxiv.org/abs/2609.04190",
      "2609.04190",
    );
    expect(result.image_url).toBeUndefined();
  });
```

**1f. Test at line 393, `"(regression) drops a resolved og:image that 404s..."`** — currently:
```ts
  it('(regression) drops a resolved og:image that 404s when actually requested (reproduces the real statichost.eu bug: content="/%20preview.png" resolves to a syntactically valid but dead URL)', async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<meta property="og:image" content="https://www.statichost.eu/%20preview.png">`,
      })
      .mockResolvedValueOnce({ ok: false, status: 404 }); // the HEAD check on the resolved image URL

    const result = await resolveItemImage("https://www.statichost.eu/");
    expect(result.image_url).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "https://www.statichost.eu/%20preview.png",
      expect.objectContaining({ method: "HEAD" }),
    );
  });
```
Change to (the image HEAD check is `ok: false`, so it short-circuits before touching `.headers` — no change needed there. But the favicon check still runs afterward via the Google fallback, adding a third real `fetch` call, so the count assertion must become `3`; the `toHaveBeenNthCalledWith(2, ...)` assertion is unaffected since it only checks the *second* call, which is unchanged):
```ts
  it('(regression) drops a resolved og:image that 404s when actually requested (reproduces the real statichost.eu bug: content="/%20preview.png" resolves to a syntactically valid but dead URL)', async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<meta property="og:image" content="https://www.statichost.eu/%20preview.png">`,
      })
      .mockResolvedValueOnce({ ok: false, status: 404 }) // the HEAD check on the resolved image URL
      .mockResolvedValueOnce({ ok: true, headers: { get: () => null } }); // the favicon (Google fallback) HEAD check

    const result = await resolveItemImage("https://www.statichost.eu/");
    expect(result.image_url).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "https://www.statichost.eu/%20preview.png",
      expect.objectContaining({ method: "HEAD" }),
    );
  });
```

**1g. Test at line 412, `"keeps a resolved og:image that passes the reachability check"`** — currently:
```ts
  it("keeps a resolved og:image that passes the reachability check", async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<meta property="og:image" content="https://example.com/real-cover.png">`,
      })
      .mockResolvedValueOnce({ ok: true }); // the HEAD check

    const result = await resolveItemImage("https://example.com/article");
    expect(result.image_url).toBe("https://example.com/real-cover.png");
  });
```
Change to (the existing image HEAD-check mock needs `headers` — without it, the new code throws internally, gets caught, and incorrectly treats this reachable image as unreachable, breaking the `toBe` assertion; also add a third mock for the favicon's Google-fallback check):
```ts
  it("keeps a resolved og:image that passes the reachability check", async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<meta property="og:image" content="https://example.com/real-cover.png">`,
      })
      .mockResolvedValueOnce({ ok: true, headers: { get: () => null } }) // the image HEAD check
      .mockResolvedValueOnce({ ok: true, headers: { get: () => null } }); // the favicon (Google fallback) HEAD check

    const result = await resolveItemImage("https://example.com/article");
    expect(result.image_url).toBe("https://example.com/real-cover.png");
  });
```

**1h. Test at line 425, `"treats a reachability-check network error the same as unreachable"`** — currently:
```ts
  it("treats a reachability-check network error the same as unreachable (drops the image, does not throw)", async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<meta property="og:image" content="https://example.com/flaky.png">`,
      })
      .mockRejectedValueOnce(new Error("network down during HEAD check"));

    await expect(
      resolveItemImage("https://example.com/article"),
    ).resolves.toEqual(expect.objectContaining({ image_url: undefined }));
  });
```
Change to (the rejected mock needs no `headers` — a rejection is caught before `.headers` is ever touched; add a third mock for the favicon's Google-fallback check):
```ts
  it("treats a reachability-check network error the same as unreachable (drops the image, does not throw)", async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<meta property="og:image" content="https://example.com/flaky.png">`,
      })
      .mockRejectedValueOnce(new Error("network down during HEAD check"))
      .mockResolvedValueOnce({ ok: true, headers: { get: () => null } }); // the favicon (Google fallback) HEAD check

    await expect(
      resolveItemImage("https://example.com/article"),
    ).resolves.toEqual(expect.objectContaining({ image_url: undefined }));
  });
```

**1i. Test at line 439, `"also verifies the arXiv ar5iv fallback figure's reachability before accepting it"`** — currently:
```ts
  it("also verifies the arXiv ar5iv fallback figure's reachability before accepting it", async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<meta property="og:image" content="https://arxiv.org/static/browse/0.3.4/images/arxiv-logo-fb.png">`,
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<figure><img src="/html/2609.04190/fig1.png"></figure>`,
      })
      .mockResolvedValueOnce({ ok: false, status: 404 }); // the HEAD check on the ar5iv figure

    const result = await resolveItemImage(
      "https://arxiv.org/abs/2609.04190",
      "2609.04190",
    );
    expect(result.image_url).toBeUndefined();
  });
```
Change to (the `ok: false` mock needs no `headers` — same short-circuit reasoning as 1f; add a fourth mock for the favicon's Google-fallback check, since the first page's HTML has no `<link rel="icon">`):
```ts
  it("also verifies the arXiv ar5iv fallback figure's reachability before accepting it", async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<meta property="og:image" content="https://arxiv.org/static/browse/0.3.4/images/arxiv-logo-fb.png">`,
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<figure><img src="/html/2609.04190/fig1.png"></figure>`,
      })
      .mockResolvedValueOnce({ ok: false, status: 404 }) // the HEAD check on the ar5iv figure
      .mockResolvedValueOnce({ ok: true, headers: { get: () => null } }); // the favicon (Google fallback) HEAD check

    const result = await resolveItemImage(
      "https://arxiv.org/abs/2609.04190",
      "2609.04190",
    );
    expect(result.image_url).toBeUndefined();
  });
```

**Tests that need NO change** (verified by tracing the code path — listed so you don't second-guess them): the two tests at lines 204 and 211 (`"returns {} ... on a non-OK response"` and `"... when fetch rejects"`) both hit `resolveItemImage`'s early-return branches, which never have `html` and therefore never call `extractFavicon` — unaffected by this task.

- [ ] **Step 2: Write the two brand-new failing tests**

Add these two `it` blocks inside the existing `describe("resolveItemImage", ...)` block (after the last existing test in that block, i.e. after `"calls fetch with an abort signal..."`):

```ts
  it("(audit fix) rejects a reachable favicon URL that carries a same-origin CORP header", async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `<link rel="icon" href="/f.ico">`,
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) =>
            name === "cross-origin-resource-policy" ? "same-origin" : null,
        },
      }); // the favicon HEAD check, blocked by CORP

    const result = await resolveItemImage("https://example.com/article");
    expect(result.favicon_url).toBeUndefined();
  });

  it("(audit fix) rejects a favicon URL that fails its own reachability check, same as image_url", async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `<link rel="icon" href="/f.ico">`,
      })
      .mockResolvedValueOnce({ ok: false, status: 404 }); // the favicon HEAD check

    const result = await resolveItemImage("https://example.com/article");
    expect(result.favicon_url).toBeUndefined();
  });
```
(Both tests' page HTML has no `og:image`, so `image_url`'s own check never calls `fetch` — only one HEAD check, for the favicon, is needed per test.)

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/imageResolution.test.ts`
Expected: multiple FAILures — the updated assertions (1a-1i) fail against the current, un-patched `imageResolution.ts`, and the two new tests (Step 2) fail because `favicon_url` isn't checked for reachability yet.

- [ ] **Step 4: Write minimal implementation**

In `src/lib/imageResolution.ts`, the current `isImageUrlReachable` function (lines 189-205) is:

```ts
async function isImageUrlReachable(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      headers: IMAGE_FETCH_HEADERS,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
```

Change to:

```ts
async function isImageUrlReachable(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      headers: IMAGE_FETCH_HEADERS,
    });
    if (!response.ok) return false;
    const corp = response.headers.get("cross-origin-resource-policy");
    return corp !== "same-origin" && corp !== "same-site";
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
```

Then, in `resolveItemImage`'s success path (line 254), the current code is:

```ts
    const html = await response.text();
    const ogImage = extractOgImage(html, pageUrl);
    const candidate =
      ogImage ?? (arxivId ? await resolveArxivFigureImage(arxivId) : undefined);
    const image_url = await verifyImageReachable(candidate);
    return { image_url, favicon_url: extractFavicon(html, pageUrl) };
```

Change the last two lines to:

```ts
    const image_url = await verifyImageReachable(candidate);
    const favicon_url = await verifyImageReachable(extractFavicon(html, pageUrl));
    return { image_url, favicon_url };
```

The two `catch`/non-OK fallback branches (which currently `return { image_url: await verifyImageReachable(fallback) }`) are **unchanged** — they never have `html`, so they never had a favicon candidate to check in the first place.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/imageResolution.test.ts`
Expected: PASS — every test in this file, both updated and new.

- [ ] **Step 6: Commit**

```bash
git add src/lib/imageResolution.ts tests/imageResolution.test.ts
git commit -m "fix(images): verify favicon reachability before persisting it, closing a cross-origin console error"
```

---

### Task 6: `/stats` — add `scope="col"` to all 10 table headers

**Files:**
- Modify: `src/pages/stats.astro` (the `<th>` elements Task 1 already wrapped)
- Test: `tests/stats-page.test.ts`

**Interfaces:**
- Consumes: Task 1's wrapped table markup (this task edits the `<th>` elements inside those same `<table>`s — land after Task 1).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Add this `it` inside the same `describe("stats.astro source structure", ...)` block in `tests/stats-page.test.ts` used in Task 1:

```ts
  it('(audit fix) gives every stats-table <th> an explicit scope="col"', () => {
    const thMatches = source.match(/<th[^>]*>/g) ?? [];
    expect(thMatches).toHaveLength(10);
    expect(thMatches.every((th) => th.includes('scope="col"'))).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/stats-page.test.ts -t "scope"`
Expected: FAIL — none of the 10 `<th>` have `scope="col"` yet.

- [ ] **Step 3: Write minimal implementation**

In `src/pages/stats.astro`, after Task 1's wrapper change, the two header rows are:

```astro
              <tr>
                <th>Model</th>
                <th>Runs</th>
                <th>Items scored</th>
                <th>Input tokens</th>
                <th>Output tokens</th>
                <th>Cost</th>
              </tr>
```
and
```astro
              <tr>
                <th>Date</th>
                <th>Runs</th>
                <th>Items scored</th>
                <th>Cost</th>
              </tr>
```

Add `scope="col"` to every `<th>` in both:

```astro
              <tr>
                <th scope="col">Model</th>
                <th scope="col">Runs</th>
                <th scope="col">Items scored</th>
                <th scope="col">Input tokens</th>
                <th scope="col">Output tokens</th>
                <th scope="col">Cost</th>
              </tr>
```
```astro
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Runs</th>
                <th scope="col">Items scored</th>
                <th scope="col">Cost</th>
              </tr>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/stats-page.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/stats.astro tests/stats-page.test.ts
git commit -m "chore(a11y): add scope=col to stats table headers (robustness polish, not a conformance fix)"
```

---

### Task 7: `DigestChart.astro` — fix illegible/collapsing x-axis labels

**Files:**
- Modify: `src/components/DigestChart.astro:48-64`
- Test: `tests/digestChart.test.ts` (**new file** — the only new test file in this plan; justified because no existing file tests this component's Chart.js config, and this repo has no jsdom/canvas execution harness to test Chart.js runtime behavior against, so a source-text assertion on the config literal is the right-sized test)

**Interfaces:**
- Consumes: none.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Create `tests/digestChart.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIGEST_CHART_SOURCE = join(
  import.meta.dirname,
  "..",
  "src",
  "components",
  "DigestChart.astro",
);

describe("DigestChart.astro chart config (audit fix)", () => {
  const source = readFileSync(DIGEST_CHART_SOURCE, "utf-8");

  it("truncates x-axis labels via getLabelForValue, not the raw tick value", () => {
    expect(source).toMatch(/this\.getLabelForValue\(value\)/);
  });

  it("caps maxRotation so label rotation can't consume unbounded height", () => {
    expect(source).toMatch(/maxRotation:\s*45/);
  });

  it("disables maintainAspectRatio so the plot area doesn't collapse on narrow containers", () => {
    expect(source).toMatch(/maintainAspectRatio:\s*false/);
  });

  it("gives the canvas an explicit CSS height so maintainAspectRatio:false has something to fill", () => {
    expect(source).toMatch(/#score-chart\s*\{[^}]*height:\s*320px/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/digestChart.test.ts`
Expected: FAIL — none of the four config strings exist in the current source.

- [ ] **Step 3: Write minimal implementation**

In `src/components/DigestChart.astro`, the current chart config and markup are:

```astro
<canvas id="score-chart" data-chart={chartDataJson} width="600" height="320"></canvas>
```
and (inside the `<script>` block):
```js
    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Interest score',
            data: scores,
            backgroundColor: colors.accent,
            borderColor: colors.accent,
            borderWidth: 1,
          },
        ],
      },
      options: {
        scales: {
          y: {
            beginAtZero: true,
            max: 10,
            ticks: { color: colors.inkSoft },
            grid: { color: colors.rule },
          },
          x: {
            ticks: { color: colors.inkSoft },
            grid: { color: colors.rule },
          },
        },
        plugins: {
          legend: { labels: { color: colors.inkSoft } },
        },
      },
    });
```

Change the `<canvas>` line's containing markup — add a `<style>` block for the canvas's CSS height (this component currently has no `<style>` block at all; add one after the `<script>` block, matching Astro's convention of `<style>` following `<script>` when both exist on one component):

```astro
<canvas id="score-chart" data-chart={chartDataJson} width="600" height="320"></canvas>

<script>
  ...
</script>

<style>
  #score-chart {
    max-width: 100%;
    height: 320px;
  }
</style>
```

Change the chart config's `options` block to:

```js
      options: {
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            max: 10,
            ticks: { color: colors.inkSoft },
            grid: { color: colors.rule },
          },
          x: {
            ticks: {
              color: colors.inkSoft,
              maxRotation: 45,
              callback(value) {
                const label = this.getLabelForValue(value);
                return label.length > 24 ? `${label.slice(0, 24)}…` : label;
              },
            },
            grid: { color: colors.rule },
          },
        },
        plugins: {
          legend: { labels: { color: colors.inkSoft } },
        },
      },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/digestChart.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/DigestChart.astro tests/digestChart.test.ts
git commit -m "fix(chart): truncate long x-axis labels and stop the plot area collapsing on mobile"
```

---

## Final Verification & Stop — do not push, do not open a PR, do not merge

After Task 7's commit, run the full suite once more to confirm nothing regressed across tasks:

```bash
cd /Users/sairamugge/Desktop/Not-Humans-World/daily-dose
npm test
npm run build
npx tsc --noEmit
git log --oneline main..HEAD   # expect exactly 7 commits, in the order above
git diff main --stat -- scripts/pipeline.ts src/lib/llmCuration.ts src/lib/curation.ts src/lib/costTracking.ts src/lib/digestSchema.ts   # expect NO output — zero lines changed in any gated file
```

Expected: `npm test` and `npm run build` both green, `tsc --noEmit` clean, exactly 7 commits on `fix/audit-findings` ahead of `main`, and zero diff in the 5 gated publish-path files.

**Stop here.** Per the user's explicit instruction, do not run `git push`, do not create a pull request, and do not merge to `main` under any circumstances in this plan. Report the branch name (`fix/audit-findings`), the 7 commit summary, and the green test/build/typecheck results back to the user, and wait for their explicit go-ahead before any push/PR/merge action.
