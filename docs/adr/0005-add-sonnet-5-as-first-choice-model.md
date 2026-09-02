# ADR 0005: Add Claude Sonnet 5 as the first-choice model in the curation fallback chain

**Status:** Accepted, 2026-09-03

## Context and Problem Statement

ADR 0003 established the model fallback chain (Sonnet 4.6 → Opus 4.6 → Haiku 4.5) by reusing exactly what the sibling Anvilry chatbot already proved worked with this shared credential. The user explicitly requested trying Claude Sonnet 5 first, falling back through the existing chain, if Sonnet 5 is available for this credential. This ADR covers verifying that availability, a real technical incompatibility discovered along the way, and an honest gap in cost-tracking confidence this change introduces.

## Decision Drivers

- Never add a model ID to `MODEL_CHAIN` on assumption — verify it is real, `ACTIVE`, and authorized for this specific AWS account/credential first, the same evidence-based standard ADR 0003 and ADR 0004 both held to.
- `scoreItemsWithLLM`'s entire structured-output mechanism depends on forced `tool_choice`; extended thinking is a documented hard incompatibility with that (ADR 0003) - any new model must be checked against this constraint specifically, not assumed compatible.
- `costTracking.ts`'s per-run cost figures must stay honest about what is confirmed versus inferred - already a documented value in this project (SOUL.md's AI-transparency non-negotiable), now applying to a pricing number, not just a curation score.

## Verification (evidence, not assumption)

- **Availability, confirmed via a real `ListInferenceProfiles` Bedrock API call** against this project's actual credential/account: `us.anthropic.claude-sonnet-5` exists, is `ACTIVE`, in `us-east-1` - not inferred from documentation, checked directly.
- **A real, hard technical incompatibility, confirmed via the model's own Bedrock model card**: Claude Sonnet 5's card states reasoning is "Supported (adaptive thinking is on by default, including for requests that omit the `thinking` field...)". Every other model in this project's chain defaults thinking to off. Left unhandled, this would either throw on every real run (best case - the existing fallback chain would just skip past it) or, worse, silently violate the forced-`tool_choice` contract in a way this file's generic-error path does not know to catch and fall back from.
- **Pricing could not be independently confirmed.** AWS's Bedrock pricing page renders its current-model table via client-side JS that a documentation fetch does not capture; the `AAVA_Bedrock_Non_Prod` credential lacks `pricing:GetProducts` (the AWS Price List API) to query it directly, and that permission was deliberately not requested for this narrowly-scoped credential. AWS's own launch announcement states Sonnet 5 offers "top-tier intelligence at Sonnet pricing" - read as a real signal, not proof of an exact number.
- **A real, live, paid verification call** (2 synthetic items, ~$0.006) confirmed the fix works end-to-end: `modelUsed` came back as `us.anthropic.claude-sonnet-5`, the forced tool_use response parsed correctly, and the model's actual judgment was substantive and honest (correctly scored both synthetic test items low, with reasoning that named exactly why).

## Decision Outcome

- `MODEL_CHAIN` in `src/lib/llmCuration.ts` becomes `[sonnet-5, sonnet-4-6, opus-4-6, haiku-4-5]` - Sonnet 5 leads, the previously-verified chain from ADR 0003 remains intact as the fallback.
- A new `MODELS_NEEDING_THINKING_DISABLED` set (currently just Sonnet 5) drives an explicit `thinking: {type: "disabled"}` on the request **only** for models known to need it - not applied universally, since Bedrock has a confirmed track record of rejecting fields a given model doesn't expect, and the other three models were already verified working without this field at all. If a future model in the chain also defaults thinking to on, extend the same set rather than changing the default for every model.
- `src/lib/costTracking.ts`'s `PRICING_PER_MILLION_TOKENS` gets a new entry for Sonnet 5 at $3/$15 per million tokens (matching Sonnet 4.6, per AWS's "Sonnet pricing" framing), **explicitly commented as unconfirmed** - not silently presented as verified fact alongside the two entries that genuinely were confirmed via AWS blog posts in ADR 0003.
- `tests/llmCuration.test.ts` updated: the primary-model success test now asserts `thinking: {type: "disabled"}` on the first call; the fallback test now additionally asserts the *second* call (Sonnet 4.6) does **not** get that field, locking in the "only the models that need it" design as a checkable behavior, not just a comment.

## Consequences

**Good:**
- Verified, not assumed, on every axis that mattered: availability, the thinking incompatibility, and end-to-end behavior via a real call.
- The one real technical risk this change introduced (thinking-on-by-default breaking forced tool_choice) was caught and fixed before it could ever reach the scheduled `daily-pipeline.yml` run, rather than being discovered as a production failure.
- Even in the worst case where this ADR's model-availability or thinking-behavior read turned out wrong, the existing `NotFoundError`/`BadRequestError` fallback (ADR 0003) means the pipeline degrades to Sonnet 4.6, not to a hard failure - the design absorbs this class of mistake by construction.

**Bad / accepted tradeoffs:**
- Sonnet 5's cost figure is an honest inference, not a confirmed number - real spend could differ from what `/stats` reports until the first genuine invoice/Cost Explorer line item confirms or corrects it. Flagged in code comments and here specifically so this isn't forgotten.
- A fourth model now needs to stay in sync with Bedrock's evolving catalog (deprecation, ID changes) - marginal additional maintenance surface on top of the three ADR 0003 already introduced.

## Confirmation

`npx tsc --noEmit` (clean), `npx vitest run` (25/25, all real network calls mocked), `npm run build` (unaffected), and one real, live, paid Bedrock call (~$0.006) confirming Sonnet 5 is actually selected and returns a valid, substantively-judged response with thinking correctly disabled.

**Open follow-up, not yet done**: confirm Sonnet 5's real per-token cost against the first genuine invoice or AWS Cost Explorer line item once `daily-pipeline.yml`'s schedule actually uses it, and correct `PRICING_PER_MILLION_TOKENS` if it differs from the $3/$15 assumed here.

## More Information

Builds on ADR 0003 (the fallback chain and forced-tool_choice/thinking incompatibility this decision had to check against) and ADR 0004 (the `daily-pipeline.yml` schedule that will actually exercise this chain in production going forward).
