# Per-Story `analysis` Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new, optional `analysis` field (a 3-4 sentence paragraph) to every digest item, populated by the real Bedrock LLM call and rendered inline on story cards — while the deterministic placeholder fallback never fabricates one.

**Architecture:** One new optional Zod field flows through three layers: the LLM's forced-tool-use response contract (`llmCuration.ts`), the pipeline's per-source candidate construction (`pipeline.ts`), and the rendered card (`StoryCard.astro`). The placeholder path (`curation.ts`) is explicitly excluded at every layer — its return shape never gains an `analysis` key, so `fromLlm?.analysis` is `undefined` on that path with zero extra branching.

**Tech Stack:** Astro 5 (static site), Zod (schema), `@anthropic-ai/bedrock-sdk` (real LLM, fully mocked in tests), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-05-story-analysis-field-design.md` (merged to `main` at commit `73e67ca`, PR #68) — this plan argues from that spec; read both.

## Global Constraints

- `analysis` is `z.string().min(1).optional()` in `DigestItemSchema` — never required, never an empty string when present.
- `src/lib/curation.ts` gets **zero changes** in this plan. Its four placeholder functions must never gain an `analysis` key — this is a `SOUL.md` non-negotiable (never dress up the placeholder as real judgment), not a style choice. The final verification task checks this with a real `git diff`.
- **Never make a real Bedrock call from any test.** The `@anthropic-ai/bedrock-sdk` mock in `tests/llmCuration.test.ts` stays fully mocked, exactly as today.
- `max_tokens` on the real Bedrock call rises from `4096` to `8192` (headroom for the added analysis text; Anthropic bills tokens actually generated, not the ceiling, so this has no cost impact by itself).
- Ship as **one branch, one PR**, atomic commits in the order below (schema → llmCuration → pipeline → StoryCard → verification) — this is one cohesive feature, not independently-shippable phases; a half-shipped state means either a broken build or a schema field nothing produces yet.
- Out of scope (do not touch): per-source icons on story badges, `src/lib/rssContent.ts` (RSS keeps rendering only `why_read`), backfilling `analysis` onto existing committed digest files.

---

## Before you start

Create and switch to a feature branch:

```bash
git checkout main
git pull
git checkout -b feat/story-analysis-field
```

---

### Task 1: Schema — add the optional `analysis` field

**Files:**
- Modify: `src/lib/digestSchema.ts`
- Test: `tests/schema.test.ts`

**Interfaces:**
- Produces: `DigestItemSchema` now accepts an optional `analysis: string` field (min length 1 when present). `DigestItem` (the inferred type) gains `analysis?: string`. Every later task relies on this.

- [ ] **Step 1: Write the failing tests**

Add these three tests to `tests/schema.test.ts`, right after the existing `"rejects a javascript: scheme image_url"` test (before the closing `});` of the `describe("DigestItemSchema", ...)` block):

```ts
  it("accepts a valid item WITHOUT analysis (most historical items won't have one)", () => {
    const result = DigestItemSchema.safeParse(validItem);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.analysis).toBeUndefined();
    }
  });

  it("accepts a valid item WITH analysis set, and parses it through unchanged", () => {
    const result = DigestItemSchema.safeParse({
      ...validItem,
      analysis:
        "This is a real, multi-sentence analysis of why the item matters technically.",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.analysis).toBe(
        "This is a real, multi-sentence analysis of why the item matters technically.",
      );
    }
  });

  it("rejects an empty-string analysis", () => {
    const result = DigestItemSchema.safeParse({
      ...validItem,
      analysis: "",
    });
    expect(result.success).toBe(false);
  });
```

- [ ] **Step 2: Run tests to verify the last two fail**

Run: `npm test -- tests/schema.test.ts`

Expected: the first new test passes trivially (an unknown key is silently stripped by Zod either way). The second new test **fails** — `result.data.analysis` is `undefined` because `analysis` isn't a recognized schema key yet, so Zod strips it. The third new test **fails** — an empty string on an unrecognized key isn't rejected; `result.success` is `true`, not `false`.

- [ ] **Step 3: Implement the schema change**

In `src/lib/digestSchema.ts`, add the new field after `why_read` (line 22):

```ts
export const DigestItemSchema = z.object({
  title: z.string().min(1),
  source: z.enum(["hn", "arxiv", "github", "devto"]),
  url: z.string().url(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tags: z.array(z.string()).default([]),
  interest_score: z.number().min(0).max(10),
  why_read: z.string().min(1),
  analysis: z.string().min(1).optional(),
  authors: z.array(z.string()).default([]),
  hn_id: z.number().optional(),
  points: z.number().optional(),
  stars: z.number().optional(),
  reactions: z.number().optional(),
  reading_minutes: z.number().optional(),
  image_url: httpUrlSchema.optional(),
  favicon_url: httpUrlSchema.optional(),
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/schema.test.ts`

Expected: all tests in this file pass, including the three new ones.

- [ ] **Step 5: Commit**

```bash
git add src/lib/digestSchema.ts tests/schema.test.ts
git commit -m "feat(schema): add optional analysis field to DigestItemSchema"
```

---

### Task 2: `llmCuration.ts` — real LLM contract gains `analysis`

**Files:**
- Modify: `src/lib/llmCuration.ts`
- Test: `tests/llmCuration.test.ts`

**Interfaces:**
- Consumes: nothing new from Task 1 directly (this file doesn't import `DigestItemSchema`).
- Produces: `ScoreResult` is now `{ interest_score: number; why_read: string; analysis: string }` (required — every genuine LLM-scored entry has one). `scoreItemsWithLLM`'s returned `LlmScoringOutcome.scores` map values include `analysis`. Task 3 relies on `ScoreResult.analysis` being present whenever `fromLlm` is defined.

- [ ] **Step 1: Write the failing tests**

First, widen the existing `toolUseResponse` test helper (top of `tests/llmCuration.test.ts`, lines 29-44) to accept an optional `analysis` per score entry — existing callers that omit it still compile, but new tests can supply it:

```ts
function toolUseResponse(
  scores: Array<{
    id: string;
    interest_score: number;
    why_read: string;
    analysis?: string;
  }>,
) {
  return {
    content: [
      {
        type: "tool_use",
        id: "toolu_123",
        name: "record_scores",
        input: { scores },
      },
    ],
    stop_reason: "tool_use",
    usage: { input_tokens: 120, output_tokens: 45 },
  };
}
```

Next, update the two EXISTING tests that will break once `analysis` becomes required by the real schema — add a real `analysis` string to every score entry they construct, and to the resulting `.toEqual()` assertion:

In `"scores items via the primary model on a successful tool_use response"` (around line 95), change the `toolUseResponse([...])` call to:

```ts
    mockCreate.mockResolvedValueOnce(
      toolUseResponse([
        {
          id: "hn-1",
          interest_score: 8,
          why_read: "Genuinely substantive discussion.",
          analysis:
            "A real, multi-sentence analysis of why this HN story is worth reading.",
        },
        {
          id: "arxiv-2501.00001",
          interest_score: 6,
          why_read: "Solid but incremental result.",
          analysis:
            "A real, multi-sentence analysis judged against the paper's own abstract.",
        },
      ]),
    );
```

and change its assertion (around line 130):

```ts
    expect(outcome.scores.get("hn-1")).toEqual({
      interest_score: 8,
      why_read: "Genuinely substantive discussion.",
      analysis:
        "A real, multi-sentence analysis of why this HN story is worth reading.",
    });
```

In `"falls back to the next model in the chain on NotFoundError from the primary model"` (around line 150), change the second `toolUseResponse([...])` call to:

```ts
      .mockResolvedValueOnce(
        toolUseResponse([
          {
            id: "hn-1",
            interest_score: 5,
            why_read: "Fine.",
            analysis: "A real, multi-sentence fallback-model analysis.",
          },
        ]),
      );
```

Now add four new tests, right after the existing `"throws if the tool_use input fails Zod validation..."` test (end of the `describe("scoreItemsWithLLM", ...)` block, before its closing `});`):

```ts
  it("throws if the tool_use input is missing analysis (the new required field)", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          id: "toolu_no_analysis",
          name: "record_scores",
          input: {
            scores: [{ id: "hn-1", interest_score: 7, why_read: "Fine." }],
          },
        },
      ],
      stop_reason: "tool_use",
      usage: { input_tokens: 50, output_tokens: 10 },
    });

    await expect(
      scoreItemsWithLLM([{ id: "hn-1", source: "hn", title: "x" }]),
    ).rejects.toThrow();
  });

  it("returns analysis in the ScoreResult on a well-formed response", async () => {
    mockCreate.mockResolvedValueOnce(
      toolUseResponse([
        {
          id: "hn-1",
          interest_score: 8,
          why_read: "Genuinely substantive discussion.",
          analysis: "A real, multi-sentence analysis of why this matters.",
        },
      ]),
    );

    const outcome = await scoreItemsWithLLM([
      { id: "hn-1", source: "hn", title: "A real story", points: 100, numComments: 20 },
    ]);

    expect(outcome.scores.get("hn-1")).toEqual({
      interest_score: 8,
      why_read: "Genuinely substantive discussion.",
      analysis: "A real, multi-sentence analysis of why this matters.",
    });
  });

  it("sends max_tokens: 8192 (raised from 4096 to fit the added analysis field)", async () => {
    mockCreate.mockResolvedValueOnce(
      toolUseResponse([
        { id: "hn-1", interest_score: 5, why_read: "Fine.", analysis: "Fine analysis." },
      ]),
    );

    await scoreItemsWithLLM([{ id: "hn-1", source: "hn", title: "x" }]);

    const callArgs = mockCreate.mock.calls[0]![0];
    expect(callArgs.max_tokens).toBe(8192);
  });

  it("requires analysis in the scoring tool's input_schema for each item", async () => {
    mockCreate.mockResolvedValueOnce(
      toolUseResponse([
        { id: "hn-1", interest_score: 5, why_read: "Fine.", analysis: "Fine analysis." },
      ]),
    );

    await scoreItemsWithLLM([{ id: "hn-1", source: "hn", title: "x" }]);

    const callArgs = mockCreate.mock.calls[0]![0];
    const itemSchema = callArgs.tools[0].input_schema.properties.scores.items;
    expect(itemSchema.required).toContain("analysis");
    expect(itemSchema.properties.analysis).toBeDefined();
  });
```

- [ ] **Step 2: Run tests to verify the new/updated ones fail**

Run: `npm test -- tests/llmCuration.test.ts`

Expected: the two updated pre-existing tests still pass (they now include `analysis` but nothing enforces or strips it yet, so it round-trips fine). The four new tests **fail**: the "missing analysis" test does NOT throw yet (no failure), the "returns analysis" test gets `undefined` for `analysis` in its `.toEqual()`, the `max_tokens` test sees `4096` not `8192`, and the `input_schema.required` test doesn't contain `"analysis"`.

- [ ] **Step 3: Implement the LLM contract change**

In `src/lib/llmCuration.ts`:

`ScoreResult` (line 74-77):
```ts
export interface ScoreResult {
  interest_score: number;
  why_read: string;
  analysis: string;
}
```

`ScoreEntrySchema` (line 119-123):
```ts
const ScoreEntrySchema = z.object({
  id: z.string(),
  interest_score: z.number().min(0).max(10),
  why_read: z.string().min(1),
  analysis: z.string().min(1),
});
```

`scoreTool` (line 206-232) — update `description` and `input_schema.properties.scores.items`:
```ts
const scoreTool = {
  name: "record_scores",
  description:
    "Record an interest score (0-10), one-sentence reason, and a short analysis for each item.",
  input_schema: {
    type: "object" as const,
    properties: {
      scores: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            id: { type: "string" as const },
            interest_score: {
              type: "integer" as const,
              minimum: 0,
              maximum: 10,
            },
            why_read: { type: "string" as const },
            analysis: { type: "string" as const },
          },
          required: ["id", "interest_score", "why_read", "analysis"],
        },
      },
    },
    required: ["scores"],
  },
};
```

`buildPrompt` (line 156-204) — insert new instructions after the existing `"Score honestly..."` paragraph and before `"Score every item listed below, using its exact id."`:
```ts
    "Score honestly. A high-engagement story is not automatically high-interest - judge substance, not popularity. Do not inflate scores and do not write clickbait-style reasons.",
    "",
    "Also write a short analysis (3-4 sentences) for each item, explaining what it actually is and why it matters technically - this is separate from the one-sentence reason above and can go into more real detail.",
    "",
    "For items that include an <abstract> or <article_excerpt> tag: you have real source text available. Decide, per item, whether adapting that real text into your 3-4 sentence analysis or writing your own original analysis would be more useful for a reader deciding whether to read the full item - then output only your chosen version. Do not default to always picking one or the other; judge each item on its own.",
    "",
    "For items with no <abstract> or <article_excerpt> tag, write your own original 3-4 sentence analysis directly - there is no real source text to compare against for these.",
    "",
    "Score every item listed below, using its exact id.",
```

`scoreItemsWithLLM`'s `max_tokens` (line 274): change `max_tokens: 4096,` to `max_tokens: 8192,`.

`scoreItemsWithLLM`'s score-map population (line 299-305):
```ts
      const scores = new Map<string, ScoreResult>();
      for (const entry of parsed.scores) {
        scores.set(entry.id, {
          interest_score: entry.interest_score,
          why_read: entry.why_read,
          analysis: entry.analysis,
        });
      }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/llmCuration.test.ts`

Expected: all tests in this file pass, including the four new ones and the two updated ones.

- [ ] **Step 5: Commit**

```bash
git add src/lib/llmCuration.ts tests/llmCuration.test.ts
git commit -m "feat(llm): add analysis to the real Bedrock scoring contract"
```

---

### Task 3: `pipeline.ts` — wire `analysis` through all four source loops

**Files:**
- Modify: `scripts/pipeline.ts`
- Test: `tests/pipeline.test.ts`

**Interfaces:**
- Consumes: `ScoreResult.analysis: string` (Task 2) via `fromLlm?.analysis`.
- Produces: every source loop's `candidate` object gains an `analysis` property before `DigestItemSchema.parse(candidate)` (Task 1's schema accepts it).

This file's `main()` makes real network calls and is not otherwise unit-tested (see the existing `mapWithConcurrency`/`buildImageableItems` precedent — only pure, exported helpers get Vitest coverage in this file; `AGENTS.md` explicitly forbids fetch-mocking here). The real risk in this task is narrower and mechanical: the same two-line change has to land identically in all four loops, and it's easy to miss one. The test below guards exactly that, by reading the file's own source text — it does not execute `main()`.

- [ ] **Step 1: Write the failing test**

Add this new `describe` block to the end of `tests/pipeline.test.ts` (the file already imports from `node:fs`? No — add the import too). At the top of the file, add:

```ts
import { readFileSync } from "node:fs";
```

Then append at the end of the file:

```ts
describe("pipeline.ts analysis wiring (source-text check - main()'s per-source loops make real network calls and are not otherwise unit-tested, per this file's existing convention; see AGENTS.md)", () => {
  const pipelineSource = readFileSync(
    new URL("../scripts/pipeline.ts", import.meta.url),
    "utf-8",
  );

  it("reads fromLlm?.analysis once per source loop (hn, arxiv, github, devto)", () => {
    const matches = pipelineSource.match(/const analysis = fromLlm\?\.analysis;/g) ?? [];
    expect(matches.length).toBe(4);
  });

  it("includes analysis in the candidate object right after why_read, once per source loop", () => {
    const matches = pipelineSource.match(/why_read,\n\s+analysis,/g) ?? [];
    expect(matches.length).toBe(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/pipeline.test.ts`

Expected: both new tests FAIL with `matches.length` equal to `0`, not `4` — neither line exists in `scripts/pipeline.ts` yet.

- [ ] **Step 3: Implement the pipeline wiring**

In `scripts/pipeline.ts`, apply this same two-part change to all four loops inside `main()`:

HN loop (around line 647-664) — add the `analysis` read right after the existing destructuring, and add `analysis,` to the candidate object right after `why_read,`:
```ts
    const { interest_score, why_read } =
      fromLlm ?? scoreStoryPlaceholder(story);
    const analysis = fromLlm?.analysis;
    const resolvedImage = resolvedImages.get(id) ?? {};

    const candidate = {
      title: story.title,
      source: "hn" as const,
      url: story.url,
      date: today,
      tags: [],
      interest_score,
      why_read,
      analysis,
      authors: story.author ? [story.author] : [],
      hn_id: story.hn_id,
      points: story.points,
      image_url: resolvedImage.image_url,
      favicon_url: resolvedImage.favicon_url,
    };
```

arXiv loop (around line 680-696):
```ts
    const { interest_score, why_read } =
      fromLlm ?? scoreArxivPlaceholder(paper);
    const analysis = fromLlm?.analysis;
    const resolvedImage = resolvedImages.get(id) ?? {};

    const candidate = {
      title: paper.title,
      source: "arxiv" as const,
      url: paper.url,
      date: today,
      tags: paper.categories,
      interest_score,
      why_read,
      analysis,
      authors: paper.authors,
      reading_minutes: computeReadingMinutes(paper.summary),
      image_url: resolvedImage.image_url,
      favicon_url: resolvedImage.favicon_url,
    };
```

GitHub loop (around line 714-730):
```ts
    const { interest_score, why_read } =
      fromLlm ?? scoreGithubPlaceholder(repo);
    const analysis = fromLlm?.analysis;
    const resolvedImage = resolvedImages.get(id) ?? {};

    const candidate = {
      title: repo.fullName,
      source: "github" as const,
      url: repo.url,
      date: today,
      tags: repo.language ? [repo.language] : [],
      interest_score,
      why_read,
      analysis,
      authors: [],
      stars: repo.stars,
      image_url: resolvedImage.image_url,
      favicon_url: resolvedImage.favicon_url,
    };
```

Dev.to loop (around line 748-765):
```ts
    const { interest_score, why_read } =
      fromLlm ?? scoreDevtoPlaceholder(article);
    const analysis = fromLlm?.analysis;
    const resolvedImage = resolvedImages.get(id) ?? {};

    const candidate = {
      title: article.title,
      source: "devto" as const,
      url: article.url,
      date: today,
      tags: article.tags,
      interest_score,
      why_read,
      analysis,
      authors: [],
      reactions: article.reactions,
      reading_minutes: computeReadingMinutes(article.bodyText),
      image_url: article.coverImage ?? resolvedImage.image_url,
      favicon_url: resolvedImage.favicon_url,
    };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/pipeline.test.ts`

Expected: both new tests pass (4 matches each).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`

Expected: no errors. This is the real correctness check for this task (`ScoreResult.analysis` is required, so `fromLlm?.analysis` correctly types as `string | undefined`, and `DigestItemSchema.parse(candidate)` accepts `analysis: string | undefined` since it's `.optional()`).

- [ ] **Step 6: Commit**

```bash
git add scripts/pipeline.ts tests/pipeline.test.ts
git commit -m "feat(pipeline): wire analysis from the LLM score into every digest candidate"
```

---

### Task 4: `StoryCard.astro` — render `analysis` inline

**Files:**
- Modify: `src/components/StoryCard.astro`
- Test: Create `tests/storyCard.test.ts`

**Interfaces:**
- Consumes: `entry.data.analysis: string | undefined` (Task 1's schema field, as read through Astro's content collection).

No committed digest data has `analysis` set yet (it's a brand-new field with no backfill — see Global Constraints), so a real `npm run build` against real committed data cannot exercise the "renders when present" branch today. Following this repo's existing precedent for exactly this situation (`tests/stats-page.test.ts`'s "source structure" tests, which assert directly against a page's own source text rather than built output), this task's test reads `StoryCard.astro`'s raw source.

- [ ] **Step 1: Write the failing test**

Create `tests/storyCard.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../src/components/StoryCard.astro", import.meta.url),
  "utf-8",
);

describe("StoryCard.astro source structure", () => {
  it("renders the analysis paragraph conditionally, between the title and the badge row", () => {
    const titleEnd = source.indexOf("</a>");
    const analysisLine = source.indexOf(
      "{entry.data.analysis && <p class=\"story-analysis\">{entry.data.analysis}</p>}",
    );
    const metaStart = source.indexOf('<div class="story-meta">');

    expect(titleEnd).toBeGreaterThan(-1);
    expect(analysisLine).toBeGreaterThan(-1);
    expect(metaStart).toBeGreaterThan(-1);
    expect(analysisLine).toBeGreaterThan(titleEnd);
    expect(analysisLine).toBeLessThan(metaStart);
  });

  it("defines a .story-analysis style rule using the shared body-text tokens", () => {
    expect(source).toMatch(
      /\.story-analysis\s*\{[^}]*font-family:\s*var\(--font-body\)[^}]*color:\s*var\(--ink-soft\)/s,
    );
  });

  it("defines a larger .story-analysis size override for the lead story", () => {
    expect(source).toMatch(/\.lead-story \.story-analysis\s*\{[^}]*font-size:/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/storyCard.test.ts`

Expected: all three tests FAIL — none of this markup or CSS exists in `StoryCard.astro` yet.

- [ ] **Step 3: Implement the rendering change**

In `src/components/StoryCard.astro`, add the conditional paragraph between the title `<a>` and the badge row `<div>` (around line 30-33):

```astro
  <a class="story-title" href={entry.data.url} target="_blank" rel="noopener noreferrer">
    {entry.data.title}
  </a>
  {entry.data.analysis && <p class="story-analysis">{entry.data.analysis}</p>}
  <div class="story-meta">
```

Add the new CSS rules inside the `<style>` block, after the `.lead-story .story-title` rule (around line 143-147, right before the `.lead-story .story-title::before` rule):

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

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/storyCard.test.ts`

Expected: all three tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/StoryCard.astro tests/storyCard.test.ts
git commit -m "feat(story-card): render analysis inline below the title"
```

---

### Task 5: Whole-feature verification

**Files:** none (verification only — no commit expected unless a real problem surfaces)

- [ ] **Step 1: Confirm the placeholder path is untouched**

Run: `git diff main -- src/lib/curation.ts`

Expected: **empty output**. If this is not empty, something in Tasks 1-4 touched the placeholder fallback — stop and revert that change; it violates this plan's Global Constraints and `SOUL.md`.

- [ ] **Step 2: Full test suite**

Run: `npm test`

Expected: all tests pass, including every test added in Tasks 1-4.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Build**

Run: `npm run build`

Expected: succeeds. Since no committed digest data has `analysis` set, the build output legitimately renders zero `.story-analysis` paragraphs today — that's expected, not a bug (the field only appears once a real pipeline run with Bedrock credentials produces one).

- [ ] **Step 5: Confirm no real LLM call happened anywhere in the test run**

Re-read the `npm test` output from Step 2 for any real network activity indicators (none expected — `@anthropic-ai/bedrock-sdk` is fully mocked in `tests/llmCuration.test.ts`, and `scripts/pipeline.ts`'s `main()` is never invoked by any test).

- [ ] **Step 6: Push and open the PR**

```bash
git push -u origin feat/story-analysis-field
gh pr create --title "feat: add per-story analysis field" --body-file /tmp/pr-body-story-analysis-field.md
```

(Write the PR body to `/tmp/pr-body-story-analysis-field.md` first — summarize the four tasks, link the spec at `docs/superpowers/specs/2026-09-05-story-analysis-field-design.md`, and note the real-cost impact called out in the spec's "Cost impact" section.)

---

## Self-Review Notes (for whoever executes this plan)

- **Spec coverage:** every section of the spec (schema, LLM, placeholder-untouched, pipeline, rendering, cost, testing, out-of-scope) maps to a task or Global Constraint above.
- **Type consistency:** `ScoreResult.analysis` (Task 2) is the single source of the `string` type that flows into `fromLlm?.analysis` (Task 3) and ultimately `entry.data.analysis` (Task 4, via `DigestItemSchema.analysis?: string`, Task 1) — verified consistent across all four tasks' code.
- **Deviation from the spec's literal testing section, recorded here rather than silently:** the spec's Testing Strategy section describes `tests/pipeline.test.ts` coverage in terms of "an item ... gets analysis written into its digest file" — phrased as if `main()`'s loops were directly unit-testable. On inspecting the real `tests/pipeline.test.ts` while writing this plan, `main()` makes real, unmocked network calls and has never been unit-tested this way (only pure exported helpers are); adding fetch-mocking to test it would be new scope this plan doesn't take on. Task 3 instead uses a source-text regression check, which still catches the realistic failure mode (one of four loops missing the change) without inventing new test infrastructure this codebase has deliberately avoided.
