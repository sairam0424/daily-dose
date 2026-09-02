# Telemetry & Cost Accounting Design

> **This entire document is a design-ahead-of-implementation spec.**
> **None of what follows is wired up today.** There is no real LLM API
> call anywhere in this codebase — no Anthropic/OpenAI keys exist in this
> environment (see `SECURITY.md`, `status.md`, `decisions.md`/ADR 0001).
> Today's "curation" step is a deterministic placeholder function over
> real HN fields (`points`, `num_comments`, title); it has no tokens, no
> provider, and no cost to log. This document exists so that when real
> LLM curation is eventually wired in, the logging/cost/dashboard/alerting
> shape is already decided — not invented under deadline pressure at
> integration time. Every section below describes a **future** system.

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

### Budget ceiling concept

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

This page cannot be built before real LLM calls exist — it would either
be empty or, worse, tempt showing placeholder/fake numbers, which would
violate the same no-fabricated-data principle that governs the scoring
function itself (see `decisions.md`/ADR 0001).

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
