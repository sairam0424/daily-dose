# Audit Fixes — Design Spec

**Classification:** Architectural (per superpowers:brainstorming) — heavier path taken by explicit user request, even though most root causes were already pinned down by the source audit.

**Source:** Confirmed findings from the 2026-09-06/07 end-to-end responsive/functional/accessibility audit of daily-dose (Workflow run `wf_f9e66cac-cda`), each independently reproduced and adversarially verified. Refined against six parallel `/deep-research` passes (one per fix) run 2026-09-07.

**Scope:** Seven small, independent, presentation-layer fixes. None touch `scripts/pipeline.ts`, `src/lib/llmCuration.ts`, `src/lib/curation.ts`, `src/lib/costTracking.ts`, or `src/lib/digestSchema.ts` — so CLAUDE.md's publish-path plan-mode gate does not apply to any of them. `src/lib/imageResolution.ts` (touched by Fix 4) is explicitly documented in its own header comment as decorative/best-effort enrichment, exempt from AGENTS.md's fail-loud rule — not gated content.

**Global constraints:**
- Minimal, surgical diffs — no refactoring beyond what each fix needs.
- No new npm dependency.
- Tests follow existing per-file conventions (`tests/build-output.test.ts`'s `readAllPageCss`-style CSS assertions, `tests/imageResolution.test.ts`'s existing `verifyImageReachable` mock pattern) — no new test files.
- Ship as one branch, one PR, one atomic commit per fix (7 commits), matching this session's established pattern for small unrelated batches.

---

## Fix 1 — `/stats` "By model" table forces page-wide horizontal scroll on mobile

**Severity:** Major. **File:** `src/pages/stats.astro`.

**Current state:** Two `<table class="stats-table">` elements (lines ~120, ~146) share one CSS rule (`.stats-table { width: 100%; ... }`, lines ~245-252) with no wrapper and no `overflow-x` anywhere in the file or in `Layout.astro`. The 6-column "By model" table renders at a fixed ~531px against a ~452px content column at mobile widths, forcing the *entire page* to scroll horizontally (79px overflow at 500px, 204px at 375px). The 4-column "By day" table does not overflow at the same width.

**Research correction:** Simply wrapping the table in an `overflow-x: auto` div is **not sufficient on its own** — with `.stats-table` keeping `width: 100%`, the table shrinks to fit the wrapper (which itself shrinks to the viewport) and never develops an intrinsic width larger than its container, so no scrollbar ever appears. The wrapper needs the table to have a `min-width` so it has a real width larger than the viewport at narrow sizes. Separately, a real axe-core rule (`scrollable-region-focusable`) requires a scrollable region containing no natively-focusable content to itself be keyboard-focusable and accessibly named, or keyboard/screen-reader users can't reach it at all.

**Fix — markup** (wrap both tables identically):
```astro
<div class="table-scroll" tabindex="0" role="region" aria-label="Model cost breakdown, scrollable">
  <table class="stats-table">
    ...
  </table>
</div>
```
(Second table's `aria-label` reads `"Daily cost breakdown, scrollable"`.)

**Fix — CSS** (add alongside the existing `.stats-table` rule; do not change `.stats-table`'s own declarations beyond adding `min-width`):
```css
.table-scroll {
  overflow-x: auto;
}

.stats-table {
  width: 100%;
  min-width: 32rem; /* forces a real scrollbar below this width instead of squeezing columns */
  ...
}
```
`32rem` (512px) is chosen because it's just above the measured natural width of the 6-column table (~531px was measured with default padding; 512px CSS min-width plus the table's own padding/border reproduces that same overflow point deliberately, so the scroll behavior kicks in exactly where the page-overflow bug used to start) — both tables share the same `.stats-table` class and min-width, so the narrower 4-column table (currently ~404px) simply never reaches the point of scrolling, which matches its current correct behavior.

**Test** (`tests/build-output.test.ts`, following its existing `readAllPageCss` pattern):
```ts
it("(audit fix) wraps both stats tables in a scrollable, keyboard-accessible region", () => {
  const style = readAllPageCss(html);
  expect(style).toMatch(/\.table-scroll\s*\{[^}]*overflow-x:\s*auto/);
  expect(style).toMatch(/\.stats-table\s*\{[^}]*min-width/);
  // markup check on the rendered /stats page
  expect(html).toMatch(/<div class="table-scroll"[^>]*tabindex="0"[^>]*role="region"[^>]*aria-label="[^"]+"/);
});
```

**Done when:** `npm test` and `npm run build` pass; a manual Playwright check at 375px confirms the page itself no longer overflows (`document.documentElement.scrollWidth === window.innerWidth`) while the `.table-scroll` div does.

---

## Fix 2 — `.preview-date` link (archive index) missing `:focus-visible`

**Severity:** Major (reframed — see note). **File:** `src/components/DigestPreviewCard.astro`.

**Current state:** `.preview-date` (lines ~35-45) defines `color` and `:hover` but no `:focus-visible` rule, so it falls back to Chromium's default blue outline, which measures 2.81:1 against the dark theme's card background — below the 3:1 threshold every other interactive element in this codebase already clears via its own `outline: 2px solid var(--accent)` pattern (6.24:1 in the same theme).

**Research correction to framing:** SC 1.4.11 (Non-text Contrast) has an explicit carve-out for *"where the appearance of the component is determined by the user agent and not modified by the author"* — since this element's outline is the pure, untouched browser default, a strict reading could argue it's technically exempt from 1.4.11's letter. This does not change the fix: it's still a real, measurable contrast gap and an inconsistency with the site's own established, more-accessible pattern, and closing it moves the element closer to the higher (AAA-level) SC 2.4.13 Focus Appearance bar too. Framed as "bring in line with the rest of the site," not "fixes an AA violation."

**Fix:**
```css
.preview-date:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

**Test** (`tests/build-output.test.ts`):
```ts
it("(audit fix) .preview-date has a :focus-visible rule matching the site's accent pattern", () => {
  const style = readAllPageCss(html);
  expect(style).toMatch(/\.preview-date:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/);
});
```

---

## Fix 3 — `archive/[date].astro`'s `.date-nav a` (Older/Newer links) missing `:focus-visible`

**Severity:** Major (same reframing as Fix 2). **File:** `src/pages/archive/[date].astro`.

**Current state:** Identical gap to Fix 2, different element. `index.astro`'s visually-identical `.date-nav a` already defines the correct rule (lines ~100-103); this file's own `.date-nav a` block (lines ~90-97) only has `color` and `:hover`.

**Fix:**
```css
.date-nav a:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

**Test:** same pattern as Fix 2, scoped to this page's rendered CSS.

---

## Fix 4 — Global `:focus-visible` fallback (new — added by research)

**Severity:** Structural hardening, not a bug fix. **File:** `src/layouts/Layout.astro`.

**Why this is being added:** Research into "how do we stop this class of bug recurring" (Fixes 2/3 are the *second* time in this codebase a per-component focus rule was missed) found that no CI tool available today closes this gap automatically — axe-core's own maintainers explicitly declined to build an automated focus-indicator-contrast check (citing false-positive risk from JS-driven focus styling), and Stylelint's accessibility plugin only fires on selectors that already have `:hover`, not generically on any missing focus rule. The concretely recommended defense-in-depth pattern, precedented by production design systems (Red Hat Design System centralizes and mandates exactly this; the Layer5 open-source site replaced scattered per-component suppression with one global rule): a global `:focus-visible` fallback, applied in a genuinely global stylesheet *before* per-component overrides in source order, so any element that forgets its own rule still gets a correct one via normal CSS cascade. Astro's scoped-CSS specificity means per-component `:focus-visible` rules (which get a scoping attribute selector added, raising their specificity) will still win over this global rule wherever a component defines its own — this is mechanically safe, not a doubled-outline risk.

**Fix** (confirmed: `Layout.astro` already has a `<style is:global>` block at line 63 — the rule goes inside that existing block, not a new one. This must be `is:global`: Astro's scoped-CSS mechanism only adds its scoping attribute to elements a component renders directly in its own template, never to `<slot />` content from child components — a plain scoped `<style>` in `Layout.astro` would compile to `:focus-visible[data-astro-cid-xxxx]` and would never match an `<a>`/`<button>` rendered by `DigestPreviewCard.astro`, `StoryCard.astro`, etc., which is the entire point of this fallback):
```css
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```
Placed near the top of `Layout.astro`'s style block, before any more-specific rule in the cascade (source order doesn't strictly matter given the specificity difference, but placing it first documents intent).

**Test** (`tests/build-output.test.ts`):
```ts
it("(audit fix) defines a global :focus-visible fallback beneath per-component overrides", () => {
  const style = readAllPageCss(html);
  expect(style).toMatch(/(?<!\S):focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/);
});
```

**Done when:** `npm test`/`npm run build` pass; manual Playwright spot-check on any already-styled element (e.g. `.story-title`) confirms focusing it still renders its own per-component outline unchanged (proving the global rule didn't override or double up with a more-specific one) — this is sufficient proof the cascade ordering is correct, since Astro's scoping guarantees any per-component rule already has higher specificity than this plain global selector.

---

## Fix 5 — Favicon cross-origin console error

**Severity:** Minor. **File:** `src/lib/imageResolution.ts`.

**Current state:** `resolveItemImage()` (line 254) assigns `favicon_url: extractFavicon(html, pageUrl)` directly, with no reachability check — unlike `image_url` on the line above, which is already routed through `verifyImageReachable()` (a HEAD-request check). One committed digest item's favicon resolves to `https://nvd.nist.gov/vuln/detail/favicon.ico` (a bare-relative `favicon.ico` href resolved against the article's full sub-path instead of the domain root), which the browser blocks with `net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin` on every homepage load.

**Research correction:** This error is specifically a Cross-Origin-Resource-Policy (CORP) header-enforcement failure (Chromium's `kCorpNotSameOrigin`), not a generic 404 and not ORB/MIME-sniffing (which has its own distinct error, `ERR_BLOCKED_BY_ORB`). CORP requires the origin server to explicitly send a `Cross-Origin-Resource-Policy` header — absent that header, CORP does not block. For *this specific* URL, the wrong path almost certainly just 404s, which the existing `response.ok` check already catches — so the planned fix (reuse `verifyImageReachable()`) is sufficient for the reported bug. But a server-side HEAD/GET can read the CORP response header even though it doesn't enforce it, and a 200 OK response carrying `Cross-Origin-Resource-Policy: same-origin` would pass a bare `response.ok` check yet still be blocked in the browser — a real, if narrower, architectural gap. Since this header is free to read from the same response already being fetched (no new request, no new dependency), closing this gap costs nothing extra.

**Fix — two changes to `imageResolution.ts`:**

1. Extend `isImageUrlReachable` to also reject a same-origin/same-site CORP header:
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

2. Route `favicon_url` through the same `verifyImageReachable()` helper `image_url` already uses (both call sites in `resolveItemImage`):
```ts
const image_url = await verifyImageReachable(candidate);
const favicon_url = await verifyImageReachable(extractFavicon(html, pageUrl));
return { image_url, favicon_url };
```
(Both the success path and the two `catch`/non-OK fallback paths that currently return `{ image_url: ... }` with no `favicon_url` key are unaffected — they never had a favicon candidate to check in the first place, since `extractFavicon` needs the fetched `html`, which isn't available on those paths.)

**Test** (`tests/imageResolution.test.ts`, mirroring the existing `verifyImageReachable`/`isImageUrlReachable` mock pattern — no real network call):
```ts
it("(audit fix) rejects a reachable favicon URL that carries a same-origin CORP header", async () => {
  (fetch as any)
    .mockResolvedValueOnce({ ok: true, text: async () => "<html></html>" }) // the page fetch
    .mockResolvedValueOnce({
      ok: true,
      headers: { get: (name: string) => (name === "cross-origin-resource-policy" ? "same-origin" : null) },
    }); // the favicon HEAD check
  const result = await resolveItemImage("https://example.com/article");
  expect(result.favicon_url).toBeUndefined();
});

it("(audit fix) favicon_url is verified reachable before being returned, same as image_url", async () => {
  (fetch as any).mockResolvedValueOnce({ ok: false }); // favicon HEAD check fails
  const result = await resolveItemImage("https://example.com/article");
  expect(result.favicon_url).toBeUndefined();
});
```

**Required test-file update (not just new tests):** `isImageUrlReachable` now unconditionally calls `response.headers.get(...)` even on the success path. Three existing mocks in `tests/imageResolution.test.ts` (lines ~197, ~344, ~419) currently mock the HEAD check as a bare `{ ok: true }` with no `.headers` property — these will throw once the new header check runs. Update each to `{ ok: true, headers: { get: () => null } }` (no CORP header present — the common, already-correct case) so they keep passing with the same asserted behavior, not just add new tests around them.

**Done when:** `npm test`/`npm run build` pass; the three updated existing mocks still assert the same success-path behavior as before (behavior-preserving for the already-correct `image_url` path), plus the two new CORP/reachability tests pass.

---

## Fix 6 — `/stats` table headers missing `scope="col"`

**Severity:** Reframed to "robustness polish," not an accessibility defect (see research correction). **File:** `src/pages/stats.astro`.

**Current state:** All 10 `<th>` across both tables (lines ~121-128, ~147-152) lack `scope="col"`.

**Research correction:** W3C's own technique documents (H63, F91) confirm a simple, single-header-row table using plain `<th>` — exactly this table's structure — is *already sufficient* for WCAG 1.3.1 conformance; `scope` is one of four independent, OR'd mechanisms for making headers programmatically determinable, and F91's actual failure target is a table with *zero* `<th>` markup at all, not one that merely lacks `scope`. Automated tooling (axe-core) doesn't flag this pattern either — its only scope-related rule only evaluates elements that already carry a `scope` attribute. **This fix does not close a real conformance gap.** It's being kept in the plan anyway because it's zero-cost and zero-downside, not because it fixes a defect — the original audit finding should be understood as a nicety, not a violation.

**Fix:** add `scope="col"` to all 10 `<th>` elements.

**Test:** extend the existing `readAllPageCss`/DOM-shape test in `tests/build-output.test.ts` (or wherever this repo's existing table-shape assertions live) with a count check: `(html.match(/<th scope="col"/g) ?? []).length === 10`.

---

## Fix 7 — Chart.js "Interest scores" x-axis labels illegible / plot collapses on mobile

**Severity:** Narrower-scope item (surfaced during audit verification of a broader, refuted claim). **File:** `src/components/DigestChart.astro`.

**Current state:** `scales.x.ticks` (lines ~56-59) has no `callback`, no `maxRotation`/`minRotation`. With 19 story-title labels up to 120+ characters, labels overlap illegibly at every tested width, and the plot area collapses to near-zero height specifically at narrow mobile widths (~375-500px) while bars/gridlines render correctly at tablet/desktop.

**Research corrections (two, both required):**
1. On a category x-axis, a `ticks.callback`'s raw `value` argument is an internal index, not the label string — the callback must call `this.getLabelForValue(value)` first, then truncate that resolved string. Truncating the raw index would be a no-op bug.
2. `maxRotation` already defaults to 50° (not unbounded) — capping it further to 45° is only a marginal change. The real fix for the height-collapse is bounding *label length* via truncation, combined with `maintainAspectRatio: false` (Chart.js's default `true` only preserves width/height *ratio* on resize — it does not guarantee any minimum plot height) plus an explicit CSS-controlled height on the chart's container, so the canvas has a guaranteed height Chart.js can't shrink to zero regardless of viewport width.

**Fix — Chart config changes in `DigestChart.astro`'s `<script>` block:**
```js
const chart = new Chart(canvas, {
  type: 'bar',
  data: { /* unchanged */ },
  options: {
    maintainAspectRatio: false,
    scales: {
      y: { /* unchanged */ },
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
});
```

**Fix — CSS** (add a container height so `maintainAspectRatio: false` has something to fill; the canvas itself keeps its existing `width="600" height="320"` HTML attributes as its intrinsic fallback size):
```css
#score-chart {
  max-width: 100%;
  height: 320px !important; /* Chart.js's responsive resize honors the canvas's CSS box when maintainAspectRatio:false */
}
```

**Explicitly out of scope:** exposing the full untruncated label set to screen readers via a visually-hidden data table. Chart.js's own documentation treats canvas accessibility as entirely the developer's responsibility and out of scope by default; this chart is a supplementary visualization of data already rendered as real text elsewhere on the page (each story's own title/score), so the canvas losing detail to a screen reader is not a net new information loss. Not adding this now keeps the fix minimal; flagged here as a legitimate future improvement, not silently dropped.

**Test:** confirmed there is no existing execution-based Chart.js test in this repo — `tests/build-output.test.ts`'s only chart-related assertion today is a shallow absence check (`expect(html).not.toContain('id="score-chart"')` on a no-data page). Astro compiles `DigestChart.astro`'s `<script type="module">` into a separate bundled JS chunk at build time, not inline HTML, so the built page's HTML string won't contain the tick-config source. Add a source-level test instead (new, minimal — reads the component source directly, same idea as testing a config literal, not runtime behavior):
```ts
// tests/digestChart.test.ts (new file — no existing DigestChart-specific test file to extend)
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("DigestChart.astro chart config (audit fix)", () => {
  const source = readFileSync("src/components/DigestChart.astro", "utf-8");

  it("truncates x-axis labels via getLabelForValue, not the raw tick value", () => {
    expect(source).toMatch(/this\.getLabelForValue\(value\)/);
  });

  it("caps maxRotation and disables maintainAspectRatio so the plot area can't collapse", () => {
    expect(source).toMatch(/maxRotation:\s*45/);
    expect(source).toMatch(/maintainAspectRatio:\s*false/);
  });
});
```
This is the one fix in this spec that adds a new test file — justified because no existing file tests this component's Chart.js config, and inventing an execution-based Chart.js/canvas test harness (this repo has no jsdom canvas setup) would be disproportionate to a config-literal check.

**Done when:** `npm test`/`npm run build` pass; manual Playwright check at ~375-500px confirms the chart's plot area (bars, y-axis gridlines) is visible, not blank, and x-axis labels are truncated and non-overlapping; a check at tablet/desktop widths confirms no visual regression from the previously-correct (bars-only) rendering there.

---

## Shipping

One branch (`fix/audit-findings` or similar) → 7 atomic commits (Fix 1 → 2 → 3 → 4 → 5 → 6 → 7, in this order — 2/3/4 grouped as they're the same concern) → one PR → CI green (`npm test && npm run build`) → squash-merge, matching this repo's standard flow.

## Verification (whole spec)

- `npm test` and `npm run build` green after all 7 fixes land.
- `npx tsc --noEmit` clean (Fix 5 touches typed TS; Fixes 1-4/6/7 are markup/CSS/JS-in-Astro only).
- Manual Playwright pass at 375px/768px/1920px confirming: `/stats` no longer causes page-level horizontal scroll; both missed `:focus-visible` elements now show the accent outline; the chart's plot area renders at all three widths.
- Diff review confirming zero lines changed in `scripts/pipeline.ts`, `src/lib/llmCuration.ts`, `src/lib/curation.ts`, `src/lib/costTracking.ts`, `src/lib/digestSchema.ts` (the named gated files).
