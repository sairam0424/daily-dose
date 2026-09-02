# Decisions

This file is the index over this project's Architecture Decision Records
(ADRs, in `docs/adr/`) plus a lightweight running log for decisions that
don't rise to ADR weight. Together they are the decision history for
daily-dose; do not duplicate cross-cutting decisions that belong in the
docs-only meta-repo at `../Not-Humans-Lab/` (link there by relative path
instead).

## What Counts as "Architecturally Significant" Here

A decision gets a full ADR (in `docs/adr/`) when it meets at least one of
these bars for daily-dose specifically:

- It fixes the **runtime/toolchain shape of either half of the system**
  (e.g., the front-end framework and its rendering mode, or the pipeline
  script's language/runtime and how it's invoked).
- It changes **how digest data is fetched, validated, or persisted** —
  the ingestion source(s), the schema-enforcement strategy shared between
  the pipeline and the site, or the on-disk digest file format.
- It changes **whether and how curation/scoring uses a real LLM** versus
  a placeholder — this is the single most consequential axis in this
  project given the no-API-keys constraint, and any change to it (adding
  a real model call, changing the placeholder's formula in a way that
  changes its meaning) gets recorded here even before ADR weight, and
  gets a full ADR once a real LLM call is actually introduced.
- It is **expensive or awkward to reverse** once digest files, CI, or a
  deployed site depend on it (e.g., changing the JSON digest schema after
  files exist on disk, or swapping the front-end framework after pages
  are live).
- It trades off between two or more of the decision drivers this project
  cares about (no-fake-data honesty, minimal dependency surface, static
  hosting simplicity, cross-suite consistency with `nh-deck` /
  `nh-skills`) rather than being an obvious, uncontested choice.

Everything else — a specific chart color, a CSS value, a test fixture's
exact content — goes in the Lightweight Decisions Log below instead of
getting its own ADR file.

## ADR Index

| ID   | Title                                                                      | Status   | Date       | Supersedes |
| ---- | ----------------------------------------------------------------------------- | -------- | ---------- | ---------- |
| 0001 | [Adopt Astro static with placeholder-scoring pipeline](docs/adr/0001-adopt-astro-static-with-placeholder-scoring-pipeline.md) | Accepted | 2026-09-02 | —          |
| 0002 | [Add arXiv as a second source, with recency-only placeholder scoring](docs/adr/0002-add-arxiv-as-a-second-source-with-recency-only-scoring.md) | Accepted | 2026-09-02 | —          |

## Lightweight Decisions Log

| Date       | Decision                                                                                                    | Rationale                                                                                                                 | Owner |
| ---------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----- |
| 2026-09-02 | Ship daily-dose as an independent, standalone GitHub repo, not nested inside `Not-Humans-Lab`.                 | Matches this workspace's polyrepo convention; `Not-Humans-Lab` is docs-only and cross-cutting, not a code host for its siblings. | @sairamugge |
| 2026-09-02 | License: Apache-2.0.                                                                                            | Decided once at the system level, applied identically across `daily-dose`, `nh-deck`, and `nh-skills` for enterprise-clearable, patent-safe consistency. | @sairamugge |
| 2026-09-02 | HN-only ingestion for this walking skeleton; arXiv is an explicit, documented fast-follow, not silently skipped. | Keeps the pipeline's first version small and provable (one API, one schema) before adding a second, differently-shaped source (arXiv abstracts, XML-ish feeds). | @sairamugge |
| 2026-09-02 | Curation/scoring is a deterministic placeholder derived only from real, already-fetched HN fields (`points`, `num_comments`, title) — never fabricated data, never a live LLM call. | No Anthropic/OpenAI API keys exist in this environment; a fake "curation" step that pretends to call a model (or hardcodes plausible-looking data) would be dishonest and would silently look like it works while doing nothing real. | @sairamugge |
| 2026-09-02 | One shared Zod schema (`src/lib/digestSchema.ts`) enforced at both the pipeline's write path and the Astro Content Collection's read path. | "One schema, two enforcement points" — avoids the classic drift where a pipeline's output shape and a site's expected input shape silently diverge over time. | @sairamugge |
| 2026-09-02 | Styling is minimal inline CSS for this walking skeleton — no Bulma, no Sass, no CSS framework. | Matches `nh-deck`'s precedent of deferring visual polish past the walking skeleton; a content-listing site with one chart does not need a CSS framework yet (YAGNI). | @sairamugge |
| 2026-09-02 | The Chart.js island is a plain `<script type="module">` importing `"chart.js/auto"` — no React, no Vue, no other UI framework. | A single bar chart does not need a component framework; Astro's zero-JS-by-default model means adding React/Vue just for one chart would be unjustified weight. | @sairamugge |
| 2026-09-02 | CI runs on `workflow_dispatch` (manual trigger) plus push/PR only; the `schedule:` cron trigger is explicitly not enabled in this phase. | Automating a daily run before real LLM curation exists would just automate publishing placeholder-scored digests unattended — cron is gated on real LLM keys existing and the user's explicit go-ahead, not a technical limitation. | @sairamugge |
| 2026-09-02 | No real Vercel deployment is connected in this phase. | Requires the user's explicit go-ahead per this project's constraints; the walking skeleton's exit criterion is a green local/CI build, not a live URL. | @sairamugge |
| 2026-09-02 | arXiv added as a second live source, scored by a separate recency-only placeholder capped below HN's range. | See ADR 0002 for full context — promoted to full ADR weight since it changes the ingestion source set and introduces a new dependency (`fast-xml-parser`). | @sairamugge |
