# Real LLM curation shipped via AWS Bedrock

**Type:** project | **Date:** 2026-09-02

## What happened

The predicted first `memory.md` entry: real LLM API keys became available
(an AWS Bedrock credential, provided by the user, shared with the sibling
Anvilry project's production chatbot) and the placeholder curation step was
replaced with a live model call as the default path. Full technical design
and rationale: `decisions.md`/ADR 0003
(`docs/adr/0003-wire-real-bedrock-curation.md`).

## What changed, concretely

- New `src/lib/llmCuration.ts` (real `AnthropicBedrock` client, one
  forced-tool-use batched call per pipeline run, Sonnet 4.6 → Opus 4.6 →
  Haiku 4.5 fallback chain, Zod-validated response) and
  `src/lib/costTracking.ts` (real per-run cost + rolling-average anomaly
  check, `src/data/stats.jsonl`).
- `src/lib/curation.ts`'s placeholder functions were **not** deleted — they
  are now an explicit, loudly-logged fallback for missing credentials or a
  per-item response gap, never the default.
- `scripts/pipeline.ts`'s `main()` was rewritten to check
  `isLlmConfigured()` and choose between the two paths, with a stale-file
  cleanup fix discovered as a side effect (see below).
- Every doc that said "no LLM keys exist"/"placeholder only" was swept and
  updated in the same change: `AGENTS.md`, `CLAUDE.md`, `SOUL.md`,
  `Context.md`, `status.md`, `README.md`, `telemetry.md`, `tech.md`,
  `SECURITY.md`, `architecture.md`, `codebase_map.md`, `TESTING.md`,
  `decisions.md`, `agent_learning.md`.

## Two real bugs found and fixed during implementation

1. **Base64-encoded credential values.** Anvilry's own convention stores
   Bedrock credentials as "raw or base64-encoded, decoded at runtime." The
   first attempt copied the raw stored value without decoding, producing a
   real `PermissionDeniedError: security token invalid`. Fixed by
   base64-detecting and decoding before use, both locally and in this
   repo's GitHub Secrets. Full detail: `agent_learning.md`'s dated entry.
2. **Stale digest files across same-day re-runs.** Discovered while
   re-testing the pipeline multiple times in one day: HN's front-page
   composition shifts through the day, so old top-N files were never
   cleaned up, leaving stale/never-refreshed entries. Fixed with a
   per-source-scoped cleanup step in `scripts/pipeline.ts`'s `main()`
   before writing new files.

## Why this belongs in memory.md, not just the ADR

This changes standing guidance that multiple docs previously stated as a
hard, load-bearing constraint ("never attempt a real LLM call," "no keys
exist") — exactly the kind of transition `TESTING.md`'s Non-Determinism
Policy and `SOUL.md`'s anti-examples anticipated and were written to be
revised for. A future agent skimming just `AGENTS.md`/`CLAUDE.md` gets the
current rules; this entry (and the ADR it points to) is for understanding
*why* those rules changed and what broke on the way.

## Cross-references

- Full design: `decisions.md`/ADR 0003 (`docs/adr/0003-wire-real-bedrock-curation.md`).
- The two bugs: `agent_learning.md`'s 2026-09-02 entries.
- Updated standing docs: see the list above.
