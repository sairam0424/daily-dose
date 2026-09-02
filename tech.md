# Tech Stack — daily-dose

Fast-lookup inventory of every technology choice in this repo, why it was
made, and how to keep it current. This file describes **daily-dose only**; it
does not restate or duplicate the umbrella-level tech.md at
`../Not-Humans-Lab/tech.md` — see "Inherited constraints" below for the one
item that flows down from there.

daily-dose is a daily AI-curated technical digest (arXiv + Hacker News) — the
author's own version of
[arpitbbhayani/the-daily-diff](https://github.com/arpitbbhayani/the-daily-diff).
It is the third of three independent sibling projects under the
Not-Humans-Lab umbrella. Every choice below is made in service of one
non-negotiable constraint for this phase: **no code may attempt a real LLM
API call.** There are no Anthropic/OpenAI API keys available in this
environment, and a "curation" step that looks like it's calling a model but
silently no-ops (or crashes) is worse than an honestly-labeled placeholder.

## Stack summary

| Layer | Technology | Role |
|---|---|---|
| Front-end framework | Astro (`output: "static"`) | Builds the static digest site; no SSR/server runtime |
| Content layer | Astro Content Collections (glob loader) | Reads `src/data/digest/*.json` into typed, validated entries |
| Schema / validation | Zod (`src/lib/digestSchema.ts`) | Single shared schema — both the content collection config and the pipeline script import the same exported schema |
| Pipeline runtime | TypeScript, run via `tsx` | `scripts/pipeline.ts`: fetch (per-source) → placeholder-score → validate → write |
| Data source | Hacker News Algolia API (`hn.algolia.com/api/v1/search?tags=front_page`) | Free, keyless, live HTTP fetch |
| Data source | arXiv public API (`export.arxiv.org/api/query`, cs.AI/cs.LG/cs.CL) | Free, keyless, live HTTP fetch — returns Atom/XML, not JSON |
| XML parsing | `fast-xml-parser` | Parses the arXiv Atom feed response (nested elements, namespaces, multi-`<author>` entries) — small, dependency-light, avoids hand-rolled regex XML parsing |
| Charting | Chart.js (`chart.js/auto`), one plain `<script type="module">` island | Renders a bar chart of the day's `interest_score`s — no React/Vue needed |
| Styling | Minimal inline CSS | No Bulma/Sass in this walking skeleton — deferred fast-follow |
| Test runner | Vitest | Unit + integration + e2e layers (see `TESTING.md`) |
| CI | GitHub Actions, `workflow_dispatch` + push/PR | Manual trigger only — `schedule:` cron explicitly not enabled this phase |
| Deployment | *(none yet)* | No Vercel project connected — deferred pending user go-ahead |
| LLM SDKs | *(none installed)* | No Anthropic/OpenAI SDK — no API keys exist in this environment |
| License | Apache-2.0 | Decided at the Not-Humans-Lab umbrella level, applied identically across sibling projects |

## Adoption status

| Technology | Status | Notes |
|---|---|---|
| Astro (static output) | **Adopt** | The entire front-end. `output: "static"` — no server adapter, no SSR. |
| Zod | **Adopt** | `src/lib/digestSchema.ts` exports `DigestItemSchema`, imported by both `src/content.config.ts` and `scripts/pipeline.ts`. One schema, two enforcement points, zero drift — see Rationale. |
| Chart.js | **Adopt** | One island (`chart.js/auto`, plain `<script type="module">`). No framework (React/Vue/Svelte) pulled in just to render one bar chart. |
| TypeScript + `tsx` | **Adopt** | Runs `scripts/pipeline.ts` directly without a separate compile step. |
| Vitest | **Adopt** | Test runner for all layers described in `TESTING.md`. |
| GitHub Actions (`workflow_dispatch`) | **Adopt (manual trigger only)** | CI runs on `workflow_dispatch` plus push/PR. The `schedule:` cron for automated daily runs is explicitly **Hold** — see below. |
| Vercel deployment | **Hold** | Not yet connected. Requires the user's explicit go-ahead before wiring up. |
| Anthropic / OpenAI SDKs | **Hold** | Not installed. No API keys exist in this environment — installing an SDK with nothing to authenticate it would be dead weight and an invitation to accidentally wire up a real call. |
| Bulma / Sass | **Hold** | Deferred fast-follow. Styling for this walking skeleton is minimal inline CSS, matching nh-deck's precedent of deferring visual polish. |
| arXiv sourcing | **Adopt** | `scripts/pipeline.ts` exports `fetchArxivPapers`, fetching live from `export.arxiv.org/api/query` (cs.AI/cs.LG/cs.CL, sorted by submission date). Scored by the placeholder `scoreArxivPlaceholder` in `src/lib/curation.ts` (recency-only signal, capped to a [3, 8] range — see that file's comment for the HN-vs-arXiv asymmetry rationale). |
| `fast-xml-parser` | **Adopt** | Parses the arXiv Atom/XML feed response in `fetchArxivPapers`. Small, well-known, dependency-light — chosen specifically because hand-rolled regex-based XML parsing is fragile against real Atom XML's nested elements, namespaces, and repeated `<author>`/`<category>` elements. |
| GitHub sourcing | **Hold (documented fast-follow)** | The shared schema already models `source: "hn" \| "arxiv" \| "github"`, but only `"hn"` and `"arxiv"` are populated so far. GitHub is a deliberate, documented simplification, not a silent gap. |

## Rationale (non-obvious choices)

- **One Zod schema, imported twice, not defined twice.**
  `src/lib/digestSchema.ts` is the single source of truth for what a digest
  item looks like. `src/content.config.ts` uses it to validate every JSON
  file Astro's glob loader reads from `src/data/digest/`;
  `scripts/pipeline.ts` uses the exact same import to validate each item
  before writing it to disk. If the schema ever needs to change, there is
  exactly one file to edit — this eliminates an entire class of "the
  pipeline wrote data the site can't render" bugs by construction, not by
  discipline.
- **`tsx`, not `ts-node`, for the pipeline script.** `tsx` is ESM-first and
  has no separate compile step, which matches Astro's own ESM-native
  tooling and avoids a second, differently-configured TypeScript execution
  path living alongside Astro's.
- **The placeholder curation step is a deliberate, honestly-labeled stub —
  not a silent gap.** `interest_score` and `why_read` are computed
  deterministically from real, already-fetched HN fields (`points`,
  `num_comments`, `title`) — never fabricated, never hardcoded fake data.
  The function is clearly commented as a placeholder standing in for a
  future real LLM call. This is the single biggest deferred item in the
  whole project and is documented as such everywhere relevant
  (`architecture.md`, `Context.md` once it exists), not hidden behind a
  plausible-looking function name.
- **Live fetch, mocked tests — not live fetch everywhere.** The HN Algolia
  fetch itself is real and network-bound; it is exercised
  manually/personally when seeding real content (see `TESTING.md`), never
  inside the automated, network-mocked test suite. Tests must stay
  deterministic.
- **`workflow_dispatch`, not `schedule:`, for CI.** Enabling a daily cron
  before real LLM keys exist would mean automating a run of the
  honest-placeholder scorer on a schedule, silently normalizing a stub as if
  it were the finished product. The manual trigger keeps every run an
  explicit, reviewed action until the curation step is real.
- **Chart.js as a plain script island, not a framework component.** One
  static bar chart of `interest_score` values does not need React/Vue's
  component model, state management, or hydration story — `<script
  type="module">` importing `chart.js/auto` directly is the entire
  requirement, matching this workspace's general preference (see nh-deck's
  analogous "no framework for one job" choice) for not reaching for a
  framework before a real need shows up.

## Version & upgrade policy

- **Node.js**: track current LTS. Bump the CI workflow's `node-version` and
  `tsx`/`astro` compatibility together.
- **Astro, Zod, Chart.js, `fast-xml-parser`, `tsx`, Vitest**: track latest stable minor/patch
  via normal dependency update flow; apply standard semver caution on
  majors, especially Astro (Content Collections API has shifted across
  majors before).
- **Anthropic / OpenAI SDKs**: no version pinned — nothing is installed to
  pin. Pick and pin a version, and add the dependency, only once real API
  keys actually exist and the fast-follow to replace the placeholder scorer
  begins.
- **Bulma / Sass**: same as above — not installed, nothing to pin yet.

## Constraints

- No code may attempt a real Anthropic/OpenAI API call anywhere in this
  repo, in any script, test, or CI job, for as long as no keys are
  configured. If keys are later added, the switch from placeholder to live
  scoring must be an explicit, reviewed change — not a quiet default flip.
- Both enforcement points for a digest item's shape
  (`src/content.config.ts` and `scripts/pipeline.ts`) must import
  `DigestItemSchema` from `src/lib/digestSchema.ts` — never redefine it
  locally.
- The pipeline script may only write to `src/data/digest/YYYY-MM-DD/`
  (one file per story); it does not touch any other part of `src/`.
- The `schedule:` cron trigger and any real deployment target must not be
  enabled without the user's explicit go-ahead — both are Hold, not merely
  unconfigured.

## Deprecated / Hold list

- **Anthropic/OpenAI SDKs** — Hold. See Constraints above.
- **`schedule:` cron trigger** — Hold, pending real LLM API keys + explicit
  user go-ahead.
- **Vercel deployment** — Hold, not yet connected.
- **Bulma/Sass** — Hold, deferred fast-follow for visual polish.
- **GitHub sourcing** — not deprecated, just not yet implemented. Listed
  under Adoption status as a documented fast-follow, not here, to avoid
  implying rejection. (arXiv sourcing has moved to Adopt — see above.)

## Local dev requirements

- Node.js current LTS installed.
- `npm install` at the repo root.
- `npm run pipeline` (wraps `tsx scripts/pipeline.ts`) — requires live
  network access to `hn.algolia.com` (HN) and `export.arxiv.org` (arXiv) to
  seed real content. No API keys required or used for either. Use
  `--sources hn` or `--sources arxiv` to run just one.
- `npm run build` (wraps `astro build`) — reads only the already-committed
  `src/data/digest/*.json` files; no network access needed.
- `npm test` — runs the automated suite against mocked HN/arXiv responses;
  no network access needed and none should be attempted (see `TESTING.md`'s
  Non-Determinism Policy).
- No database, no external service beyond the free HN Algolia and arXiv
  endpoints, and no LLM API key needed to develop or test this project at
  its current phase.

## Inherited constraints (from the Not-Humans-Lab umbrella)

- **License: Apache-2.0.** Decided once at the system level and applied
  identically across all three sibling projects (`daily-dose`, `nh-deck`,
  `nh-skills`): "explicit patent grant matters more for enterprise adoption
  than MIT's silence on patents; consistency across all three signals a
  deliberate choice to reviewers." See `../Not-Humans-Lab/decisions.md` for
  the full system-wide rationale — not duplicated here.
