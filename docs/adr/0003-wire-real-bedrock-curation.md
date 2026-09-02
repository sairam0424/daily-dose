# ADR 0003: Wire real LLM curation via AWS Bedrock, replacing the placeholder as the default path

**Status:** Accepted, 2026-09-02

## Context and Problem Statement

ADR 0001 established a deterministic placeholder scoring function specifically because no LLM API keys existed in this environment. That constraint has now changed: the user provided a working AWS Bedrock credential (an IAM user, already in production use by the sibling Anvilry portfolio's chatbot, using the `@anthropic-ai/bedrock-sdk` package and a Sonnet 4.6 → Opus 4.6 → Haiku 4.5 model fallback chain). This ADR covers how real curation was actually wired in, not just that it was decided to do so.

## Decision Drivers

- Reuse a proven, already-working credential and SDK pattern rather than inventing a new one - the sibling project's `src/lib/llm.ts` is the reference implementation.
- Keep local dev and the automated test suite working without real credentials or real network calls - the placeholder must remain available as an explicit fallback, not be deleted.
- Cost is not a meaningful constraint at this volume (confirmed via research: even Opus on every item every day for a month stays under $2), so design for correctness and honesty of judgment, not cost optimization.
- Untrusted external content (HN titles, arXiv abstracts) must never be treated as instructions - a real prompt-injection mitigation, not just a documented risk.

## Considered Options

1. **One real Bedrock call scoring every item in a single batch (chosen).** Cheapest, simplest, matches the deep-research recommendation, and is what was implemented.
2. **Tiered scoring (Haiku scores everything, Sonnet re-scores the top few).** Explicitly considered and rejected for this first implementation - the research confirmed the only real benefit is engineering practice, not cost savings, and it adds real complexity (two calls, a selection step) for a benefit that does not matter yet at this volume. May be revisited later.
3. **A fixed dollar-per-day budget ceiling as a circuit breaker.** Rejected - at ~10 items/day, any fixed number is either too loose to mean anything or too tight to survive normal variance (a longer arXiv abstract day). Replaced with a rolling 7-day-average anomaly check (see Decision Outcome) plus a genuine pre-flight item-count sanity ceiling.
4. **Raw `@aws-sdk/client-bedrock-runtime` instead of `@anthropic-ai/bedrock-sdk`.** Rejected - the Anthropic-maintained SDK presents the same Messages API surface Anthropic's own docs describe, is what the sibling project already proves works with this exact credential, and avoids hand-rolling SigV4 request construction.

## Decision Outcome

Implemented `src/lib/llmCuration.ts`:
- `AnthropicBedrock` client constructed from `BEDROCK_ACCESS_KEY_ID`/`BEDROCK_SECRET_ACCESS_KEY`/`BEDROCK_REGION` env vars (never `providerChainResolver` - that path is for edge runtimes without env var support, not GitHub Actions), `maxRetries: 4`.
- One non-streaming `messages.create()` call per model-fallback attempt, forcing `tool_choice: {type: "tool", name: "record_scores"}` on a single tool whose input covers every item's score in one array - not one call per item, not the newer JSON-schema structured-outputs beta (Bedrock has a confirmed track record of rejecting fields the direct API accepts).
- Zod validation (`ScoresResponseSchema`) on the tool's `input` as the real safety net - the tool's own `input_schema` only biases generation, it does not guarantee compliance.
- `NotFoundError`/`BadRequestError` (imported from `@anthropic-ai/sdk` directly, not re-exported by `bedrock-sdk`'s top-level index) drive the model-fallback chain; anything else is already retried by the SDK's own `maxRetries` and is left to fail loudly if it still fails.
- No extended thinking anywhere - confirmed as a hard API incompatibility with forced `tool_choice`, not a cost/latency preference.
- `MAX_REASONABLE_ITEMS = 50` pre-flight sanity ceiling: refuses to call the LLM at all if a bug ever passes far more items than a normal day's ~10-item run. This is the real preventive safeguard (a fixed dollar ceiling could only warn after a single batched call already completed).

Implemented `src/lib/costTracking.ts`: real per-run cost computed from actual token usage against a verified AWS Bedrock pricing table (Sonnet 4.6 $3/$15 per M tokens, Opus 4.6 $5/$25, Haiku 4.5 ~$1/$5, all confirmed against AWS documentation during the Bedrock research pass), appended to `src/data/stats.jsonl` (committed, not gitignored - real historical data). A run is flagged (logged as a warning, not blocked - the call has already completed by the time cost is known) only if its cost exceeds 5x the trailing 7-day average, once at least 3 days of history exist.

Extended `fetchArxivPapers` (`scripts/pipeline.ts`) to capture the Atom feed's `<summary>` element as `RawArxivPaper.summary` - the previous title-plus-categories-only shape was too thin for any genuine LLM judgment; the actual abstract is required for real curation to mean anything for arXiv items.

`scripts/pipeline.ts`'s `main()` now checks `isLlmConfigured()`: if true, builds one combined batch from both sources and calls `scoreItemsWithLLM` once; if false, falls back to the existing placeholder functions per item, with a loud console warning either way (never silent). A per-item fallback to placeholder scoring also exists if the LLM's response omits a specific item's score, again with an explicit warning.

Discovered and fixed a real, separate bug while doing this: repeated same-day pipeline runs previously accumulated stale files, since HN's front-page composition shifts throughout the day and old top-N entries were never removed. `main()` now deletes any existing file (scoped to the sources actually run) that is not part of the current run's output before writing, so a day's folder always reflects a clean, current snapshot rather than an ever-growing accumulation.

## Consequences

**Good:**
- Real, substantive, honest curation - verified live: the model correctly scored a 394-point HN story lower than a less-popular-but-more-substantive one, matching the prompt's explicit instruction not to conflate engagement with genuine interest.
- Zero real cost concern at this volume - a full real run (10 items) cost ~$0.02.
- Local dev and CI remain fully functional without credentials (placeholder fallback intact, automated tests mock the SDK entirely).
- Fixed a real latent bug (stale file accumulation) that would have surfaced eventually regardless of this change.

**Bad / accepted tradeoffs:**
- The credential is shared with the sibling Anvilry chatbot's production usage - rotating it is now a two-repo operation (documented in `SECURITY.md`; a GitHub-OIDC migration path exists as a fast-follow but is not implemented).
- The rolling-average anomaly check cannot prevent a single anomalously expensive batched call (it already happened by the time cost is known) - only the pre-flight item-count ceiling provides real prevention. Accepted because a single-call-per-day design has no multi-call runaway-loop risk to begin with.
- Base64-encoded credential values (the sibling project's convenience format for its own deployment platform) caused one real, debugged failure (`PermissionDeniedError: security token invalid`) before decoding was applied correctly here too - documented in `agent_learning.md`.

## Confirmation

`npx vitest run` (22/22 passing, LLM calls fully mocked), `npm run build` (real content renders), and three real live Bedrock calls during implementation (~$0.054 total), the last of which produced a clean, consistent, fully real-LLM-scored 10-item digest for 2026-09-02 with the stale-file bug fixed.

## More Information

Supersedes the "no real LLM call anywhere in this codebase" constraint stated throughout ADR 0001 and the original walking-skeleton docs - those docs are being updated to match, not treated as still-current.
