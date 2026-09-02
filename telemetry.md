# Telemetry & Cost Accounting Design

> **Update (2026-09-02, ADR 0003): real LLM curation now exists**, and a
> subset of what follows is genuinely wired up — see "What's actually
> implemented today" immediately below. The rest of this document
> (per-call structured logging, golden signals, dashboards, alerting, the
> public `/stats` page) is **still a design-ahead-of-implementation spec**,
> not yet built. Sections below are marked `[IMPLEMENTED]` or
> `[NOT YET IMPLEMENTED]` inline so this file stays accurate rather than
> reverting to "none of this exists" now that some of it does.

## What's actually implemented today

- **Per-run cost accounting**, in `src/lib/costTracking.ts`: real
  `input_tokens`/`output_tokens` from the Bedrock response's own usage
  metadata (never estimated), converted to `cost_usd` via a verified
  per-model pricing table, appended as one JSON line per pipeline run to
  `src/data/stats.jsonl` (`{date, model, inputTokens, outputTokens,
  costUsd, itemCount, flaggedAnomalous}`).
- **Anomaly detection, not a budget ceiling.** ADR 0003 deliberately chose
  a rolling 7-day-average anomaly check over the fixed-dollar-ceiling
  concept originally sketched below: a run is flagged (logged as a
  `console.warn`, not blocked — the call has already completed by the
  time cost is known) only if its cost exceeds 5x the trailing 7-day
  average, once at least 3 days of history exist. See "Budget ceiling
  concept" below for how this differs from the original design.
- **A real pre-flight sanity ceiling** (`MAX_REASONABLE_ITEMS = 50` in
  `src/lib/llmCuration.ts`) refuses to call the LLM at all if a bug ever
  passes far more items than a normal day's ~10-item run — this is the
  actual preventive safeguard; the anomaly check above can only warn
  after a call already happened.
- **Not yet implemented**: the structured per-call log record described in
  "What We Log" below (today's logging is a `console.log` summary line
  per run, not a structured per-call record with `pipeline_run_id`,
  `latency_ms`, `outcome`, etc.), golden-signal tracking, the public
  `/stats` page, dashboards, and alerting. These remain a
  design-ahead-of-implementation spec — read on, but do not assume they
  exist in code.

## Why Draft This Now

Cost and token accounting is easy to bolt on badly (a raw `console.log`
of a response object, no aggregation, no budget concept) if it's designed
after the fact. Drafting the shape now — while there is zero pressure to
ship it — lets the eventual real-LLM integration (see ADR 0001) implement
against a settled design instead of inventing one under deadline
pressure, and lets `SECURITY.md`'s prompt-injection requirement and this
cost design land together, since both touch the same code path (the
future model-call function).

## What We Log

Once a real LLM call exists, every call should produce one structured log
record — not scattered `console.log` calls. Proposed fields per call:

| Field             | Type      | Notes                                                                 |
| ------------------ | --------- | ---------------------------------------------------------------------- |
| `timestamp`         | ISO 8601  | UTC, call start time                                                    |
| `provider`           | string    | e.g. `anthropic`, `openai` — must match an actual configured provider  |
| `model`               | string    | exact model ID used (e.g. `claude-sonnet-4-5`), never a generic alias   |
| `pipeline_run_id`      | string    | correlates every call within one `npm run pipeline` invocation         |
| `story_id`              | string    | the HN item ID (or arXiv ID, once that source exists) being scored     |
| `input_tokens`           | integer   | from the provider's own response metadata, never estimated/guessed     |
| `output_tokens`           | integer   | same — real, reported usage, not a token-counter approximation         |
| `cost_usd`                 | decimal   | computed from `input_tokens`/`output_tokens` × that model's published per-token rate at call time |
| `latency_ms`                 | integer   | wall-clock time for the call                                           |
| `outcome`                     | enum      | `success` \| `error` \| `timeout` \| `rate_limited`                     |
| `error_detail`                  | string?   | present only on non-`success` outcomes; never logs the raw prompt/response body (see Security note below) |

**Security note carried over from `SECURITY.md`:** log records must never
include the raw ingested content (HN title/comment text, arXiv abstract)
verbatim if that content could itself contain something sensitive or
adversarial — log a hash or truncated/redacted excerpt plus `story_id`,
not the full untrusted text, so logs don't become a second place where
unsanitized third-party content lands.

## Golden Signals / SLOs

Once real LLM calls exist, track the standard "golden signals" for the
curation step specifically, not just the pipeline as a whole:

- **Latency**: p50/p95/p99 per-call latency; SLO target TBD once real
  call volume exists — do not invent a number with zero data behind it.
- **Traffic**: calls per pipeline run (expected to equal the number of
  stories fetched that day, modulo any batching decision made later).
- **Errors**: error rate by `outcome` category (`error` /`timeout` /
  `rate_limited`) — a rate-limit spike is a distinct signal from a hard
  failure and should be distinguishable in dashboards, not collapsed into
  one generic "failure" bucket.
- **Saturation**: proximity to the budget ceiling (see below) — this is
  the signal unique to LLM cost accounting that a generic web-service
  SLO framework wouldn't otherwise capture.

## LLM Usage & Cost Accounting Design

### Per-call accounting

Every call logs the row described in "What We Log" above. This is the
atomic unit — daily and any other rollups are derived from it, never
tracked independently (avoids the classic bug where a running total
drifts from the sum of its parts).

### Daily aggregate

One aggregate record per `pipeline_run_id` (effectively, per day once the
cron is enabled):

- Total calls, total input tokens, total output tokens, total `cost_usd`.
- Cost broken down by `provider`/`model`, in case more than one model is
  ever used (e.g., a cheap model for a first-pass filter, a stronger
  model for the final `why_read` write-up).
- Count of non-`success` outcomes, for quick day-over-day error-rate
  comparison without recomputing from raw call logs.

### Budget ceiling concept — superseded by the rolling-average anomaly check

**This section describes the original design; ADR 0003 chose a different
approach for the actual implementation** (a rolling 7-day-average anomaly
check with no fixed dollar number — see "What's actually implemented
today" above) because at this project's real volume (~10 items/day, one
batched call/day) a fixed number is either too loose to mean anything or
too tight to survive normal variance, and a single-call-per-day design has
no multi-call runaway-loop risk for a hard ceiling to actually prevent.
Kept below for historical context, not as the current design.

A configurable **daily budget ceiling** (a `cost_usd` threshold) that the
pipeline checks against before making further calls in a run:

- If a run's running total cost crosses the ceiling mid-run, the pipeline
  should **stop making further LLM calls for that run** and fall back to
  the deterministic placeholder scoring function for any remaining
  stories — not silently keep spending, and not hard-crash the whole
  pipeline run over a soft budget signal.
- The ceiling value itself should be a configuration value (environment
  variable or config file), not hardcoded — so it can be tuned without a
  code change once real cost data exists to tune it against.
- Crossing the ceiling should be a loud, logged event (a distinct
  `outcome`-adjacent signal, or its own log line) — not a silent
  fallback a maintainer would have to notice by comparing story counts.

## Public Stats Page Spec (`/stats`, future)

A future `/stats` page on the Astro site, once real LLM cost data exists
to show:

- **Totals**: cumulative calls, tokens (input + output), and stories
  curated by real LLM calls (vs. placeholder-scored, if a fallback ever
  triggers) since tracking began.
- **Actual dollar cost.** This is the part worth calling out explicitly:
  **the reference project's own `/stats` page (`the-daily-diff`) never
  showed dollar costs.** This project's design intentionally goes one
  step further, once real costs exist to report, by showing actual
  `cost_usd` totals (daily and cumulative) alongside the usage totals —
  not just call/token counts. This is a deliberate differentiator from
  the reference project's stats page, not an oversight in either
  direction.
- **Per-day breakdown**, mirroring the daily aggregate described above,
  so a visitor can see cost trend over time, not just a single lifetime
  number.
- Explicitly **not** in scope for `/stats`: per-story cost (too granular
  to be meaningful publicly) or raw per-call logs (which may contain
  redacted-but-still-sensitive metadata per the Security note above).

Real LLM calls now exist (`src/data/stats.jsonl` has genuine data as of
ADR 0003), so this page is no longer blocked on "nothing honest to show" —
it is a real, buildable fast-follow candidate now, just not yet built. See
`status.md`'s Upcoming Milestones.

## Dashboards

Once real usage exists, a minimal internal (non-public) dashboard should
show, at minimum:

- Daily cost trend (line chart), with the budget ceiling drawn as a
  reference line.
- Error-rate trend by `outcome` category.
- Latency distribution (p50/p95/p99) per model, in case a model swap
  changes latency characteristics.

No specific dashboarding tool is chosen yet — this is deliberately left
open until there's real data to decide against (a spreadsheet, a simple
Astro-rendered internal page reading the same log records, or a
third-party observability tool, depending on actual volume once it
exists).

## Alerting

Proposed alert conditions, once real LLM calls exist (none of these can
fire today — there is nothing to alert on):

- **Budget ceiling crossed** mid-run → notify the maintainer (channel
  TBD — email, or a GitHub Issue auto-filed by the workflow) with the
  run ID and the point at which the fallback to placeholder scoring
  kicked in.
- **Error rate above a threshold** for a single pipeline run (e.g., more
  than N% of calls in one run end in `error`/`timeout`) → notify, since
  this likely indicates a provider outage or a broken prompt/schema
  change rather than normal variance.
- **Sustained rate-limiting** across consecutive runs → notify, since
  this suggests the pipeline's call volume or concurrency needs
  adjusting, not just a transient blip.
- No alert thresholds are finalized here — they should be set from real
  observed variance once real call data exists, not guessed in advance.
