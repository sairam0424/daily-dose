# agent_learning.md — daily-dose

Append-only, dated register of corrections applied to AI agents working in this repo — companion to `AGENTS.md`/`CLAUDE.md` (which hold current-state static instructions), not a replacement. This file holds the *history of why* those instructions exist.

**Scope:** learnings specific to this project's own code/domain. A learning that recurs in two or more sibling projects' own `agent_learning.md` files gets copied up to `../Not-Humans-Lab/agent_learning.md`, with a one-line pointer left here.

## Entries

### 2026-09-02 — Promoted to system level (x2)

Two learnings recurred here after first being observed in nh-deck:

1. **Aspirational docs drift** — this repo's docs described a single array-per-day digest file (`src/data/digest/YYYY-MM-DD.json`) and a separate `src/components/ScoreChart.astro`; the real, working pipeline writes one file per story into a dated folder, and the chart renders inline in `index.astro`. The array-file shape was also a genuine architecture bug, not just a doc error — Astro's `glob()` content loader requires one schema-matching object per file, so the original shape would have failed `astro build` outright. Fixed in `scripts/pipeline.ts` and `src/content.config.ts`, then swept across 11 doc files.
2. **ConfigProtection blocks `tsconfig.json` in any new project with its own `package.json`** — pre-empted here by proactively adding this repo's `tsconfig.json` path to the hook's allowlist before running the scaffold workflow, based on hitting the same block in nh-deck first.

Full entries, root causes, and the standing rules now in force for both: see `../Not-Humans-Lab/agent_learning.md`.

### 2026-09-02 — Bedrock credentials copied from the sibling Anvilry project may be base64-encoded; decode before use

- **Trigger**: real LLM curation was wired in for the first time (ADR 0003). The exact same `BEDROCK_ACCESS_KEY_ID`/`BEDROCK_SECRET_ACCESS_KEY` values that resolved to a working IAM identity via `sts.get_caller_identity` (which tolerates base64 input in some SDK paths) produced a real `PermissionDeniedError: 403 The security token included in the request is invalid` when passed as-is into `AnthropicBedrock`'s SigV4 signing.
- **Observation**: Anvilry's own `.env.local`/`src/lib/llm.ts` documentation already stated these values may be "raw or BASE64-encoded (decoded at runtime)" via a `decodeSecret` helper - this was read during research but not actually applied when the values were first copied into this repo's GitHub secrets and into a local test run.
- **Root cause**: assumed "the credential works" (proven via one successful boto3 call) meant "the raw stored value is safe to pass through anywhere" - it does not; some AWS client paths tolerate or auto-detect base64 input, `AnthropicBedrock`'s SigV4 signer does not.
- **Correction / Rule**: whenever copying a credential value FROM Anvilry's `.env.local` (or any source documented as "raw or base64-encoded") to a new destination, always attempt a base64-decode first and use the decoded value if it round-trips to printable text - never assume the raw stored bytes are what a new consumer expects. This was fixed in both the GitHub repo secrets and every real local test run.
- **Scope**: this-project-only for now (only daily-dose has wired in real Bedrock calls so far), but flag if nh-deck or nh-skills ever do the same - promote to system level if it recurs.
- **Status**: active.

## Entry format

- **Date**
- **Trigger** — what prompted the entry
- **Observation** — what the agent did or assumed, verbatim where useful
- **Root cause** — why the agent got it wrong
- **Correction / Rule** — the concrete, checkable rule now in force
- **Scope** — this-project-only vs. system-wide (system-wide entries get promoted, see above)
- **Status** — active | superseded | promoted-to-AGENTS.md (with a link to where it landed)
