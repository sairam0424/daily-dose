# Harmful Content Exclusion — Design Spec

## Context (real, confirmed incident)

A real pipeline run on 2026-09-05 fetched a real GitHub trending repo, `GangTailorUpgrade/undress-service` — an explicit non-consensual AI image manipulation ("undress") tool. The real Bedrock LLM call correctly identified this: `interest_score: 0`, and both `why_read` and `analysis` explicitly stated it "has no legitimate technical merit," is "widely associated with creating non-consensual sexual imagery," and "does not belong in a technical digest regardless of its star count."

Despite that correct judgment, the item was still written to the digest and rendered on the site — including its own real, per-repo promotional image (a GitHub repository social-preview image the tool's authors uploaded themselves, showing suggestive marketing content for the tool). This image is a genuinely per-item, non-generic image — it does not match `isGenericImageUrl`'s blocklist (PR #74) and would not match any URL-pattern heuristic, because the bug isn't in image *sourcing*, it's that daily-dose currently has no mechanism to act on the LLM's own real content judgment beyond a numeric score. A `0`-scored item with real, correct, explicit harm language in its own `why_read`/`analysis` still gets a full card — title, badge, analysis text, **and its own promotional image** — on the public site.

This spec closes that gap: use the LLM's own existing, real judgment to exclude genuinely harmful/inappropriate items from the digest entirely, not just down-rank them.

## Decision

Add one new field to the same real, existing, forced-tool-use Bedrock call: `exclude: boolean`. When `true`, `scripts/pipeline.ts` skips writing that item to the digest **entirely** — no file, no card, no image, nothing. This is deliberately not a UI-layer filter (e.g. hiding low-score items) — the item must never enter the committed digest data at all, so there's no code path that could ever render its image or text.

**Scope discipline, explicit:** `exclude` is for actively harmful, illegal, or inappropriate content only — tools/content that shouldn't be featured in a professional technical digest regardless of technical merit or popularity (NCII/deepfake generation, malware, harassment tooling, and similarly harmful categories). It is NOT a second way to express "boring" or "low quality" — that's what `interest_score` already does, and items scored low-but-not-harmful must still be included (e.g. a real 0-scored item that's simply uninteresting stays in the digest, visibly deprioritized, exactly as today). The prompt instruction below makes this distinction explicit to the model.

## Real current state (grounds every change below)

- `src/lib/llmCuration.ts` — `ScoreResult` is `{interest_score, why_read, analysis}`. `ScoreEntrySchema`/`scoreTool.input_schema` require exactly those three fields per item. `buildPrompt` (lines 195-211) already has the full instruction set for scoring/why_read/analysis. `scoreItemsWithLLM`'s `scores.set()` (line 310-314) populates the map.
- `scripts/pipeline.ts` — four per-source loops (HN line ~639, arXiv ~674, GitHub ~710, Dev.to ~746), each starting `const fromLlm = llmScores?.get(id);` then warning if `llmScores && !fromLlm`, then `const { interest_score, why_read } = fromLlm ?? scorePlaceholderFn(...)`.
- `src/lib/curation.ts` — the placeholder fallback, deterministic, derives everything only from real fetched engagement numbers. It has no way to judge harm/inappropriateness (that requires real semantic understanding, which is exactly what a placeholder must never fake per `SOUL.md`). **This file gets zero changes** — placeholder-scored items are never excluded; the guardrail only exists when real LLM curation is active. This mirrors the same real-capability boundary already established for the `analysis` field.

## Changes — `src/lib/llmCuration.ts`

**`ScoreResult`:**
```ts
export interface ScoreResult {
  interest_score: number;
  why_read: string;
  analysis: string;
  exclude: boolean;
}
```

**`ScoreEntrySchema`:** add `exclude: z.boolean()`.

**`scoreTool`:** update description and schema:
```ts
const scoreTool = {
  name: "record_scores",
  description:
    "Record an interest score (0-10), one-sentence reason, a short analysis, and an exclusion flag for each item.",
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
            exclude: { type: "boolean" as const },
          },
          required: ["id", "interest_score", "why_read", "analysis", "exclude"],
        },
      },
    },
    required: ["scores"],
  },
};
```

**`buildPrompt`:** add one new instruction paragraph, inserted after the existing "Score honestly..." paragraph and before the "Also write a short analysis..." paragraph:

```
"Also decide whether each item should be excluded entirely from a professional technical digest for being actively harmful, illegal, or inappropriate - for example, a tool whose real purpose is generating non-consensual intimate imagery, malware, or harassment tooling. Set exclude: true ONLY for genuinely harmful or inappropriate content, never merely because an item is low-quality, boring, or off-topic - those cases get a low interest_score instead and must still be included, not excluded.",
```

**`scoreItemsWithLLM`'s score-map population:** add `exclude: entry.exclude` to the `scores.set(...)` call.

No change to `max_tokens` (8192 already has ample headroom for one boolean field per item).

## Changes — `scripts/pipeline.ts`

Identical two-line addition in all four per-source loops, right after each loop's existing `const fromLlm = llmScores?.get(id);` line (before the existing "LLM response did not include a score" warning check):

```ts
    const fromLlm = llmScores?.get(id);
    if (fromLlm?.exclude) {
      console.warn(
        `[curation] Excluding ${id} from the digest - the real LLM flagged it as harmful/inappropriate content.`,
      );
      continue;
    }
```

This `continue` skips the rest of that loop iteration entirely — no candidate object is built, no `DigestItemSchema.parse()` call happens, no file gets pushed to `files`. The existing `llmScores && !fromLlm` warning check below it is unaffected (an excluded item still has a real `fromLlm` entry, it just never reaches that check because of the `continue`).

## No schema change needed

`src/lib/digestSchema.ts` needs **no change** — an excluded item is never turned into a candidate object, so it never reaches schema validation at all. `exclude` never appears in any written JSON file.

## Cost impact

Negligible — one more boolean field in the same existing structured response, same single batched call, same model. Not a new kind of LLM call.

## Testing strategy

- `tests/llmCuration.test.ts` — `ScoreEntrySchema` requires `exclude`; a mocked response with `exclude: true` round-trips through `scoreItemsWithLLM` into the returned `ScoreResult`; `scoreTool.input_schema` requires `exclude`. Update the existing mocked-response test fixtures to include `exclude: false` (mirroring how `analysis` was added previously).
- `tests/pipeline.test.ts` — cannot exercise the loop's `continue` behavior directly (per this file's established convention — `main()` is not unit-tested; only pure helpers are). No new test needed here; verified instead via the manual real-pipeline re-run below.
- Manual verification (already partially done): re-run the real pipeline once fixed and confirm the exact incident item (or an equivalent real harmful item, if that specific repo is no longer trending) is genuinely absent from the written digest files, not just scored low.

## Out of scope

- Any change to how `interest_score`/`why_read`/`analysis` behave for genuinely low-quality-but-not-harmful items — unchanged.
- Image-specific moderation (e.g. an image-safety classifier) — unnecessary; excluding the whole item at the text-judgment stage already prevents its image from ever being fetched or rendered (the image-resolution step never runs for an excluded item, since it's never in the digest to enrich).
- Any change to the placeholder fallback (`curation.ts`) — explicitly stays incapable of this judgment, per `SOUL.md`.
