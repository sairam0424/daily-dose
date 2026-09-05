# Per-Story `analysis` Field — Design Spec

## Context

Story cards on daily-dose currently show a title and a badge row (source, reading time, points/discuss link, an info icon). The only prose about *why an item matters* is `why_read` — one sentence, hidden by default behind the info icon's click-to-reveal popover. The user compared this to `arpitbbhayani/the-daily-diff` (tdd.cat), which shows real per-item depth, and asked for richer, always-visible per-story content.

This is an architectural-scope change: it adds a new field to the shared Zod schema, changes the real Bedrock LLM's forced-tool-use response contract, and changes what the pipeline writes to every digest file going forward. Per `CLAUDE.md`'s plan-mode gate, this spec exists before any of those files are touched.

All product decisions below were already made via direct `AskUserQuestion` rounds with the user in a prior session; this document formalizes them against the real, current code (every file cited was re-read in full while writing this spec, not recalled from memory).

## Decisions (already made, recorded here for traceability)

1. **Both** of the two options the user was offered — surfacing more of what's already fetched (real arXiv abstract / Dev.to excerpt) AND having the LLM generate a longer analysis — ship together, not either/or.
2. **New field, not a replacement.** `why_read` stays exactly as it is today (short one-sentence reason, same click-to-reveal popover). A new `analysis` field is added alongside it.
3. **Length:** one real paragraph, ~3-4 sentences.
4. **Scope by source, verbatim from the user:** *"if you real data extract from thing then you take that one, take a LLM written and judge both and show the best one"* — for arXiv/Dev.to (real fetched body text exists: arXiv abstract, Dev.to's capped excerpt), the model considers both a real-text-derived analysis and one it writes itself, and outputs whichever is more useful for that specific item. For HN/GitHub (no real body text to fetch), there is nothing to compare against — the model just writes the analysis directly, same as `why_read` today.
5. **Per-source icons** (replacing the plain-text `HN`/`ARXIV`/`GITHUB`/`DEVTO` badges) are explicitly **out of scope for this spec** — small, presentation-only, doesn't touch the publish path. Ships as its own separate, later change.

## Real current state (grounds every change below)

- `src/lib/digestSchema.ts` — `DigestItemSchema` has `interest_score`/`why_read` as the only scoring-related fields; no `analysis` field exists.
- `src/lib/llmCuration.ts` — one batched, forced-tool-use Bedrock call (`scoreItemsWithLLM`). `ScoreResult` is `{interest_score, why_read}`. `ScoreEntrySchema`/`ScoresResponseSchema` validate the tool's `input`. `scoreTool.input_schema` requires exactly `{id, interest_score, why_read}` per item. `buildPrompt` already emits `<abstract>` (arXiv, from `item.summary`) and `<article_excerpt>` (Dev.to, from `item.bodyText`) tags with the real fetched text — no new fetch is needed for decision #4. `max_tokens: 4096` on every call.
- `src/lib/curation.ts` — the placeholder fallback (`scoreStoryPlaceholder`/`scoreArxivPlaceholder`/`scoreGithubPlaceholder`/`scoreDevtoPlaceholder`), each returning only `{interest_score, why_read}`, deterministically from real fetched fields. Per this file's own header comment and `SOUL.md`, these must never fabricate content that isn't directly computable from real values — an `analysis` paragraph is exactly that kind of fabrication, so the placeholder must **never** produce one.
- `scripts/pipeline.ts` — four per-source loops (HN/arXiv/GitHub/Dev.to), each doing `const { interest_score, why_read } = fromLlm ?? scorePlaceholderFn(...)` then building a `candidate` object validated via `DigestItemSchema.parse(candidate)`. `toScorableHnItem`/`toScorableArxivItem`/`toScorableGithubItem`/`toScorableDevtoItem` build the `ScorableItem` sent to the LLM; `toScorableArxivItem` already passes `summary`, `toScorableDevtoItem` already passes `bodyText`.
- `src/components/StoryCard.astro` — renders `.story-title`, then `.story-meta` (badge row containing the `why_read` popover). No paragraph element exists between them today.
- `src/lib/rssContent.ts` — renders only `why_read` in the RSS `<content:encoded>` body. Not touched by this spec (see Out of Scope).

## Schema change — `src/lib/digestSchema.ts`

Add one new optional field:

```ts
analysis: z.string().min(1).optional(),
```

Placed after `why_read` in `DigestItemSchema`. Optional because:
- Every historical digest file (all of `src/data/digest/**/*.json` written before this change) lacks it — Astro's content-collection glob loader must keep validating them without a migration.
- The placeholder fallback path (see below) must legitimately produce no value, not an empty string or fabricated text.

`content.config.ts` needs no change — it imports `DigestItemSchema` directly, so the new field is picked up automatically.

## LLM change — `src/lib/llmCuration.ts`

This is the file that makes the real, paid Bedrock call — every change below is to the live prompt and the live forced-tool-use contract.

**`ScoreResult`:**
```ts
export interface ScoreResult {
  interest_score: number;
  why_read: string;
  analysis: string;
}
```
Required (not optional) here — a genuine LLM score entry always includes one. Placeholder-path values never flow through this type (see Pipeline wiring below).

**`ScoreEntrySchema`:** add `analysis: z.string().min(1)`, required. If the model ever omits it, Zod validation fails for that item exactly the same way a missing `why_read` would today — this is deliberate: a model response with a genuine score but no analysis is a contract violation worth surfacing loudly, not silently tolerating.

**`scoreTool.input_schema`:** add `analysis: { type: "string" as const }` to `properties.scores.items.properties`, and add `"analysis"` to that item's `required` array (alongside `id`, `interest_score`, `why_read`).

**`scoreTool.description`:** update to mention the new field, e.g.: `"Record an interest score (0-10), one-sentence reason, and a short analysis for each item."`

**`buildPrompt`:** add instructions covering decision #4's judging behavior. Insert after the existing "Score honestly..." paragraph:

```
"Also write a short analysis (3-4 sentences) for each item, explaining what it actually is and why it matters technically — this is separate from the one-sentence reason above and can go into more real detail.",
"",
"For items that include an <abstract> or <article_excerpt> tag: you have real source text available. Decide, per item, whether adapting that real text into your 3-4 sentence analysis or writing your own original analysis would be more useful for a reader deciding whether to read the full item — then output only your chosen version. Do not default to always picking one or the other; judge each item on its own.",
"",
"For items with no <abstract> or <article_excerpt> tag, write your own original 3-4 sentence analysis directly — there is no real source text to compare against for these.",
```

No new fetch, no second call — the real abstract/excerpt is already in the prompt via the existing `<abstract>`/`<article_excerpt>` tags, and the judgment happens inside the same single structured response.

**`max_tokens`:** raise from `4096` to `8192`. Rationale: a 3-4 sentence analysis per item is roughly 3-5x the token cost of the existing one-sentence `why_read`. On a full `MAX_REASONABLE_ITEMS`-scale batch (or even a normal ~15-20 item day), the combined output (id + score + why_read + analysis, ×N items, plus JSON/tool-call structural overhead) could approach or exceed the current 4096 ceiling, risking truncated/invalid tool-call JSON. Anthropic bills by tokens actually generated, not by `max_tokens`, so this is free headroom, not a cost increase by itself.

**`scoreItemsWithLLM`:** the `scores.set(...)` call gains `analysis: entry.analysis`.

## Placeholder fallback — `src/lib/curation.ts`: **no changes**

`scoreStoryPlaceholder`/`scoreArxivPlaceholder`/`scoreGithubPlaceholder`/`scoreDevtoPlaceholder` keep returning exactly `{interest_score, why_read}` — nothing added. This is the direct, load-bearing consequence of `SOUL.md`'s non-negotiable: the placeholder must never be dressed up as real judgment, and a 3-4 sentence "analysis" synthesized from only points/stars/recency would be exactly that. An item scored by the placeholder simply has no `analysis` — `StoryCard.astro` falls back to showing only the existing `why_read` popover for that item, unchanged from today's behavior.

## Pipeline wiring — `scripts/pipeline.ts`

Applied identically across all four loops (HN, arXiv, GitHub, Dev.to). Today each loop does:

```ts
const { interest_score, why_read } = fromLlm ?? scoreStoryPlaceholder(story);
```

Add one line directly after it, in each of the four loops:

```ts
const analysis = fromLlm?.analysis;
```

This is deliberately **not** folded into the existing destructuring. `fromLlm` is `ScoreResult | undefined`; the placeholder functions' return type has no `analysis` property at all, so `fromLlm ?? placeholderFn(...)` is a union type where `analysis` isn't a valid property to destructure without widening the placeholder's type — which would require `curation.ts` to know about a field it must never produce. Reading `analysis` off `fromLlm` directly instead means: real LLM score → real analysis; placeholder path (either no credentials, or this one item missing from the LLM's response) → `fromLlm` is `undefined` → `analysis` is `undefined` → nothing fabricated, with zero extra branching logic. This is the same pattern already used for `resolvedImage.image_url`/`favicon_url` earlier in each loop (an optional enrichment that's simply absent when not available).

Each loop's `candidate` object gains `analysis,` (shorthand for `analysis: analysis`) as a new property — placed after `why_read` for readability, matching the schema's field order. `DigestItemSchema.parse(candidate)` already accepts `analysis` as optional, so a placeholder-path candidate with `analysis: undefined` parses exactly as it does today for any other optional field.

No change to `toScorableHnItem`/`toScorableArxivItem`/`toScorableGithubItem`/`toScorableDevtoItem` — they already pass everything the new prompt instructions need (`summary` for arXiv, `bodyText` for Dev.to).

## Rendering — `src/components/StoryCard.astro`

Add a conditional paragraph between the title and the badge row:

```astro
<a class="story-title" href={entry.data.url} target="_blank" rel="noopener noreferrer">
  {entry.data.title}
</a>
{entry.data.analysis && <p class="story-analysis">{entry.data.analysis}</p>}
<div class="story-meta">
  ...
</div>
```

New CSS, following this file's existing convention of styling via shared tokens rather than a per-skin override (matching `.reading-badge`/`.discuss-link`/`.points`, which also have no Newspaper-specific override — only headline-level elements do):

```css
.story-analysis {
  margin: 0.4rem 0 0;
  font-family: var(--font-body);
  font-size: 0.85rem;
  line-height: 1.55;
  color: var(--ink-soft);
}

.lead-story .story-analysis {
  font-size: 0.95rem;
}
```

An item scored by the placeholder (no `analysis`) renders no paragraph at all — the card looks exactly as it does today, title straight into the badge row. This is the same `{condition && <Element />}` pattern this file already uses for `.story-image` and the favicon `<img>`.

## Cost impact (real, not hypothetical)

This increases real per-run Bedrock spend — every scored item now generates a 3-4 sentence paragraph in addition to its existing one-sentence reason. No new cost-control code is needed: `src/lib/costTracking.ts`'s existing rolling-average anomaly check (`ANOMALY_MULTIPLIER` × trailing 7-day average) already re-baselines against real observed cost, and `/stats` already surfaces real per-run and per-day totals publicly. The first few post-ship runs will show a real, visible step up in `/stats`' totals — expected, not a bug to chase.

## Testing strategy

- `tests/schema.test.ts` — `analysis` optional (valid without it), valid with a non-empty string, rejects an empty string (`min(1)`).
- `tests/llmCuration.test.ts` — `scoreTool.input_schema` requires `analysis`; `ScoresResponseSchema`/`ScoreEntrySchema` reject a response missing `analysis` on an item; `scoreItemsWithLLM` returns `analysis` in each `ScoreResult`; the mocked `client.messages.create` call is asserted to use `max_tokens: 8192`.
- `tests/pipeline.test.ts` — for each of the four sources: an item with a matching LLM score gets `analysis` written into its digest file; an item scored via the placeholder path (no credentials, or a per-item LLM response gap) has `analysis` absent (`undefined`), never a fabricated string.
- `tests/build-output.test.ts` (or a new `StoryCard`-focused test, implementer's call in the plan) — `.story-analysis` renders when `entry.data.analysis` is present; renders nothing extra when absent, matching how this file already tests the optional `.story-image`.

## Out of scope for this spec

- **Per-source icons** on story badges (decision #5) — separate, later, presentation-only change.
- **`why_read`'s existing behavior** — unchanged: same one-sentence popover, same placeholder logic, same schema field.
- **`src/lib/rssContent.ts`** — the RSS feed's `<content:encoded>` body continues to render only `why_read`. Adding `analysis` to RSS output wasn't requested; a fast-follow if wanted later.
- **Backfilling `analysis` onto existing digest files** — never done. Historical files simply lack the field, exactly like any other schema field added after the fact in this repo.
