# agent_learning.md — daily-dose

Append-only, dated register of corrections applied to AI agents working in this repo — companion to `AGENTS.md`/`CLAUDE.md` (which hold current-state static instructions), not a replacement. This file holds the *history of why* those instructions exist.

**Scope:** learnings specific to this project's own code/domain. A learning that recurs in two or more sibling projects' own `agent_learning.md` files gets copied up to `../Not-Humans-Lab/agent_learning.md`, with a one-line pointer left here.

## Entries

### 2026-09-02 — Promoted to system level (x2)

Two learnings recurred here after first being observed in nh-deck:

1. **Aspirational docs drift** — this repo's docs described a single array-per-day digest file (`src/data/digest/YYYY-MM-DD.json`) and a separate `src/components/ScoreChart.astro`; the real, working pipeline writes one file per story into a dated folder, and the chart renders inline in `index.astro`. The array-file shape was also a genuine architecture bug, not just a doc error — Astro's `glob()` content loader requires one schema-matching object per file, so the original shape would have failed `astro build` outright. Fixed in `scripts/pipeline.ts` and `src/content.config.ts`, then swept across 11 doc files.
2. **ConfigProtection blocks `tsconfig.json` in any new project with its own `package.json`** — pre-empted here by proactively adding this repo's `tsconfig.json` path to the hook's allowlist before running the scaffold workflow, based on hitting the same block in nh-deck first.

Full entries, root causes, and the standing rules now in force for both: see `../Not-Humans-Lab/agent_learning.md`.

## Entry format

- **Date**
- **Trigger** — what prompted the entry
- **Observation** — what the agent did or assumed, verbatim where useful
- **Root cause** — why the agent got it wrong
- **Correction / Rule** — the concrete, checkable rule now in force
- **Scope** — this-project-only vs. system-wide (system-wide entries get promoted, see above)
- **Status** — active | superseded | promoted-to-AGENTS.md (with a link to where it landed)
