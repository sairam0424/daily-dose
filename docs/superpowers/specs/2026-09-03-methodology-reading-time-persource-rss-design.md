# Design: methodology page, reading-time badges, per-source RSS feeds

**Status:** Approved, 2026-09-03
**Authored via:** `superpowers:brainstorming` (architectural path)

## Context and purpose

A fresh, second-round gap-analysis workflow compared daily-dose against
three newsletter/digest products it had never been compared against
before: TLDR.tech, Hacker Newsletter, and Console.dev (the first round
compared it against arpitbbhayani/the-daily-diff, whose 6 real gaps
were already closed — HN discuss links, dark/light theme, `/latest.json`,
Vercel Analytics, source/signal filter, sitemap).

The research produced two important corrections to its own premise
along the way: Console.dev's assumed "searchable tool directory" does
not exist on the live site (every directory-style URL returned a real
404), and Hacker Newsletter turned out to be a bare Carrd landing page
with no archive, RSS, or methodology page at all — daily-dose already
exceeds both on nearly every axis. The real, verified gaps that
survived scrutiny are narrower than the original hypothesis: a
published curation-methodology page (Console.dev's `/selection-criteria`),
per-story reading-time/format labels (TLDR.tech), and a declared
per-category RSS pattern (Console.dev, though its actual feed content
was unverifiable — bot-blocked).

This spec covers building all three, in priority order. A fourth,
lower-priority idea (grouping each day's digest into headed per-source
sections, inspired by TLDR) is explicitly deferred per the gap
analysis's own recommendation — it's cosmetic polish competing against
an already-working `FilterBar`, not a real capability gap, and not
part of this spec.

## Decisions resolved during brainstorming

1. **Methodology page nav:** gets a third masthead nav link
   (`Methodology →`) on all 4 existing pages, alongside the existing
   `Cost & stats →` / `All digests →` links.
2. **Reading-time formula:** standard 200 words-per-minute
   (`Math.max(1, Math.round(wordCount / 200))`), applied to both arXiv
   abstracts and Dev.to excerpts.
3. **Excerpt honesty wording:** arXiv gets `"~X min read"` (the
   abstract is the real, complete, standalone text as published — not
   a truncation of something longer). Dev.to gets `"~X min excerpt"`
   (its `body_markdown` is a genuine, arbitrary 1500-character
   truncation of a real, longer post — the label must not imply it
   measures the full article).
4. **Real hidden complexity found during brainstorming, and resolved:**
   neither arXiv's abstract nor Dev.to's excerpt is currently persisted
   in `DigestItemSchema` — both exist only transiently in
   `scripts/pipeline.ts`'s in-memory objects, used to build the LLM
   prompt, then dropped before `DigestItemSchema.parse()` (which has no
   field for them, so Zod silently strips them). This means Feature 2
   is **not** purely render-side as originally framed — it requires a
   real schema change and a real pipeline change, both on this repo's
   documented "publish path." Resolved: persist only a computed
   `reading_minutes: number` (optional field), computed once at
   pipeline-write time from the in-memory text — never the raw
   abstract/excerpt text itself. Minimal, YAGNI-aligned, no growth in
   committed-JSON size beyond one small number per arXiv/Dev.to item.

## Feature 1 — `/methodology` page

**What:** New `src/pages/methodology.astro`, wrapped in the shared
`Layout`. Content is sourced by importing real, already-existing
exported constants directly — never duplicated as hardcoded prose that
could drift from the real values:

- From `src/lib/llmCuration.ts`: `MAX_REASONABLE_ITEMS`, and a
  plain-language paraphrase of the real prompt-injection-mitigation
  framing (the `<item>` tags treat all ingested text as untrusted data,
  never instructions).
- From `src/lib/interestTier.ts`: the three tier boundaries (`<6`
  notable, `6-7.9` recommended, `>=8` must-read).
- From `src/lib/costTracking.ts`: `ANOMALY_MULTIPLIER`,
  `SEED_BASELINE_USD`, `MIN_HISTORY_FOR_ANOMALY_CHECK`, and the real
  per-model `PRICING_PER_MILLION_TOKENS` table.
- The real LLM-vs-placeholder-fallback distinction (when each path
  triggers), expanding the current one-line footer disclosure into a
  full explanation.

**Files touched:** new `src/pages/methodology.astro`; modified
`src/pages/index.astro`, `src/pages/stats.astro`,
`src/pages/archive/index.astro`, `src/pages/archive/[date].astro` (each
gains one new nav link, mechanical, non-publish-path).

**Done when:** the page renders in a real build, includes the actual
current values of every constant listed above (not hardcoded
duplicates — verified by a test that imports the same constants and
asserts they appear in the rendered HTML, so the page cannot silently
drift from the real code), and all 4 existing pages show the new nav
link.

## Feature 2 — reading-time / format badges

**What:**
1. `src/lib/digestSchema.ts`: add `reading_minutes: z.number().optional()`.
2. `scripts/pipeline.ts`: compute `Math.max(1, Math.round(wordCount / 200))`
   from the real in-memory `summary` (arXiv) / `bodyText` (Dev.to) text,
   immediately before each item's `DigestItemSchema.parse()` call, and
   attach it to the candidate object. HN and GitHub items never get
   this field (schema-absent, not zero — there is no body text fetched
   for either source, so there is nothing honest to compute).
3. `src/lib/readingTime.ts` (new, pure, unit-testable):
   `formatReadingBadge(item: DigestItem): string`:
   - `source === "hn"` → `"Discussion"`
   - `source === "github"` → `"Repo"`
   - `source === "arxiv"` → `` `~${reading_minutes} min read` `` (falls
     back to `"Paper"` if `reading_minutes` is unexpectedly absent —
     schema allows it as optional, so an old/malformed record could
     lack it; never throw on a missing field, never fabricate a number)
   - `source === "devto"` → `` `~${reading_minutes} min excerpt` ``
     (same fallback rule → `"Article"`)
4. `src/components/DigestList.astro`: render the badge in the existing
   `.story-meta` line, alongside score/points/discuss-link.

**Files touched:** `src/lib/digestSchema.ts`, `scripts/pipeline.ts`,
new `src/lib/readingTime.ts`, `src/components/DigestList.astro`.

**This feature touches the publish path** (`digestSchema.ts` and
`scripts/pipeline.ts` are both on `CLAUDE.md`'s explicit list) — the
implementation plan's task for this feature must be dispatched with
that framing, and the eventual SDD implementer must not treat this as
a purely cosmetic render-side change.

**Done when:** every arXiv/Dev.to item written by a real pipeline run
has a real, non-fabricated `reading_minutes` derived from real fetched
text; HN/GitHub items never have the field; `formatReadingBadge()` has
unit tests for all 4 source branches plus the missing-field fallback
for arxiv/devto; a real build shows the correct label per source on at
least one committed item of each type.

## Feature 3 — per-source RSS feeds

**What:** Four new routes, each a thin filter wrapper around the
existing, already-tested `rss()` + `renderDayContent()` machinery:

- `src/pages/rss/hn.xml.ts`
- `src/pages/rss/arxiv.xml.ts`
- `src/pages/rss/github.xml.ts`
- `src/pages/rss/devto.xml.ts`

Each: calls `groupEntriesByDate()` on `getCollection('digest')`,
filters each date group's `entries` down to the one source before
passing to `renderDayContent()`, and skips (does not emit) any date
that has zero entries for that source after filtering — never an empty
`<item>`.

- Title: `` `daily-dose — ${sourceLabel}` `` (e.g. "daily-dose — Hacker News").
- Description: `` `${sourceLabel} picks from the daily-dose digest — a daily AI-curated technical digest.` ``
- `sourceLabel` mapping: `hn` → "Hacker News", `arxiv` → "arXiv",
  `github` → "GitHub", `devto` → "Dev.to".

**Discoverability:** no new `<link rel="alternate">` tags added
site-wide (would add 4 tags to every page's `<head>` for a niche
feature) — instead, links to all 4 feeds are added to the new
`/methodology` page (Feature 1) and to `/archive/`, both natural,
low-noise homes for a "subscribe to just one source" feature.

**Files touched:** 4 new route files; modified `src/pages/methodology.astro`
(Feature 1, if built first) and `src/pages/archive/index.astro` (already
touched by Feature 1's nav link — this adds the 4 feed links to the
same file).

**Done when:** each feed, in a real build, contains only items from its
one source, correctly omits dates with zero matching items, and has a
dedicated test mirroring `rss-feed.test.ts`'s existing structure.

## Testing strategy

Feature 1: one e2e test importing the same real constants
(`ANOMALY_MULTIPLIER` etc.) and asserting they appear in
`dist/methodology/index.html` — proves the page can't silently drift
from the real values. Feature 2: unit tests for all 4
`formatReadingBadge()` branches plus the two fallback cases
(arxiv/devto missing `reading_minutes`), plus one e2e assertion that a
real committed item's badge renders correctly. Feature 3: 4 new test
files mirroring `rss-feed.test.ts`'s existing pattern, one per feed,
each asserting only-matching-source items appear and non-matching dates
are correctly omitted.

## Error handling / edge cases

- Feature 2: an arXiv/Dev.to item with `reading_minutes` absent (old
  record predating this feature, or a future manual edit) renders a
  source-appropriate static fallback label, never a crash and never a
  fabricated number.
- Feature 3: a source with zero committed items at all (e.g. Dev.to
  today, per the current repo state) produces a feed with zero
  `<item>` elements — a real, valid, empty RSS feed, not an error.

## Out of scope (per the gap analysis's own findings — not reopened here)

Grouping each day's digest into headed per-source sections (deferred,
lower priority — the existing `FilterBar` already solves "find items
from source X"), multi-vertical newsletters, a searchable tool
directory (the premise was factually wrong — Console.dev has none),
sitewide search, email delivery, sponsorship/ads, testimonials, a
podcast, bot-protection, a privacy policy page.
