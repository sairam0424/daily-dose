# 0002. Add arXiv as a second source, with recency-only placeholder scoring

## Status

Accepted — 2026-09-02

## Context and Problem Statement

ADR 0001 deliberately shipped HN-only for the walking skeleton, with arXiv
sequenced as an explicit fast-follow once the one-source pipeline was
solid. That skeleton shipped, went CI-green, and has been running for real
(live fetch, placeholder score, real `astro build`) — the fast-follow
condition is met.

arXiv differs from HN in two ways that matter for this decision:

1. **Transport format.** HN's Algolia API returns JSON; arXiv's public API
   returns an Atom/XML feed. Hand-rolled regex parsing of real Atom XML
   (nested elements, namespaces, multiple `<author>` entries per `<entry>`)
   is fragile and likely wrong in edge cases.
2. **No engagement signal.** HN gives us `points` and `num_comments` — a
   real, if crude, proxy for community interest. arXiv's API gives us no
   citation count, no downloads, no votes — nothing except metadata
   (title, authors, categories, published date). The only genuinely real,
   fetched signal available is recency.

## Decision Drivers

- Do not fabricate an engagement signal arXiv doesn't actually provide.
- Do not hand-roll XML parsing for a feed shape with real structural
  complexity (namespaces, repeated elements).
- Keep the existing `DigestItemSchema` unchanged — it already modeled
  `source: "arxiv"` in ADR 0001, anticipating this fast-follow.
- Keep the same "one file per story" filesystem convention `glob()`
  requires (see the comment in `scripts/pipeline.ts`'s `main()`).

## Considered Options

1. **Hand-rolled regex extraction of the Atom XML** — rejected: real Atom
   feeds have enough structural variation (whitespace inside `<title>`,
   0-or-more `<category>` elements, 1-or-more `<author>` elements) that
   regex parsing would be a second, worse place for exactly the kind of
   silent-corruption bug a real XML parser exists to prevent.
2. **A heavier XML/Atom-specific library** — rejected: the actual parsing
   need is generic ("give me this XML as a JS object"), not
   Atom-feed-specific; a small, general-purpose parser is a better fit
   than a heavier, narrower dependency.
3. **Score arXiv the same way as HN (points/comments-shaped formula)** —
   not possible: arXiv has no equivalent fields. Substituting a fabricated
   stand-in (e.g. a fixed constant, or citation counts scraped from a
   different, unrelated API) would violate the "no fabricated data" /
   "honest placeholder" non-negotiable in `SOUL.md`.
4. **Wait for real LLM keys before adding arXiv at all** — rejected: this
   would block a genuinely available, low-risk scope expansion (a second
   free/keyless data source) on an unrelated blocker (LLM API keys) that
   has nothing to do with whether the fetch/parse/validate pipeline works.

## Decision Outcome

Add `fetchArxivPapers()` to `scripts/pipeline.ts`, using the small,
well-known `fast-xml-parser` package to parse arXiv's Atom feed (query
targeting `cs.AI`/`cs.LG`/`cs.CL`, sorted by submission date descending).
Add `scoreArxivPlaceholder()` to `src/lib/curation.ts`: a clearly-commented
placeholder deriving `interest_score` purely from recency (exponential
decay, 5-day half-life), **deliberately capped to the `[3, 8]` range** —
never reaching the `9-10` "must read" band a viral HN story can hit via
real community engagement. `why_read` cites only real fetched fields
(published date, category tags), never fabricated summary content.
`main()` now accepts `--sources` (default `hn,arxiv`) and writes
`arxiv-<sanitized-id>.json` files alongside the existing `hn-<hn_id>.json`
convention, one file per story, matching `glob()`'s requirement.

## Consequences

**Good:**
- A second, genuinely live, keyless data source now runs by default,
  closing the gap between the project's "arXiv + Hacker News" framing and
  what it actually did.
- The recency-vs-engagement scoring asymmetry is documented in code and in
  `Context.md`/`status.md`, not hidden — a reader (or a future agent) can
  see exactly why arXiv items rank lower today and that it's intentional.
- `fast-xml-parser` is a small, single-purpose addition, not a broader
  Atom/RSS framework — scope stayed proportional to the actual need.

**Bad:**
- arXiv items will systematically under-rank comparable HN items until
  real LLM scoring replaces both placeholders — a real, if temporary,
  quality asymmetry in the shipped product, not just an implementation
  detail.
- A second real dependency (`fast-xml-parser`) and a second external API
  surface (arXiv) now exist to break, rate-limit, or change shape — the
  pipeline's failure surface grew, proportional to the new capability.

## Confirmation

Verified via a real, live pipeline run (`npx tsx scripts/pipeline.ts`):
wrote 5 HN + 5 arXiv items in one run, all validated against
`DigestItemSchema`, all rendered correctly by `astro build` (spot-checked
real titles from both sources in the built `dist/index.html`). Full test
suite green (13/13), including two new tests
(`content-collection.test.ts`, `build-output.test.ts`) added in the same
change to close a previously-documented test gap.

## More Information

Supersedes nothing in ADR 0001 — that ADR's HN-only scoping was correct
for its own moment and is not rewritten here. See `Context.md`'s Roadmap
and `status.md`'s Upcoming Milestones for what's still deferred (real LLM
scoring, a third source, cron, deployment).
