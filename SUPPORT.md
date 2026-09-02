# Support

daily-dose is a personal, small daily AI-curated technical digest (arXiv
+ Hacker News) — the author's own version of
[arpitbbhayani/the-daily-diff](https://github.com/arpitbbhayani/the-daily-diff).
It is maintained by one person in spare time. Support here is **best
effort, with no SLA** — please calibrate expectations accordingly. If you
need guaranteed response times, this project is not the right dependency
for that.

## How to Get Help (in order)

1. **Read the docs first** — see Links below. Most "why doesn't the
   digest include arXiv," "why is `interest_score` computed this way and
   not by a real model," or "why isn't the cron running daily" questions
   are answered there — those are all documented, deliberate gaps in
   this walking skeleton, not bugs (see `status.md`).
2. **Search existing issues** — someone may have already hit the same
   problem: use GitHub's issue search on this repo before opening a new
   one.
3. **Open a GitHub issue** — for bugs, pipeline failures, schema
   validation errors, build failures, unclear docs, or feature requests.
   This is the primary channel. See "How to File a Good Bug Report"
   below.
4. **GitHub Discussions** (if enabled on this repo) — for open-ended
   questions, "should scoring work differently," or general feedback
   that isn't a concrete bug.
5. **Do not use security channels for support** — if your issue is a
   suspected vulnerability (e.g., a way ingested content could influence
   a future LLM prompt, or a schema-validation bypass), stop and go to
   `SECURITY.md` instead (see Security Issues section below).

## Links to Docs

- Project overview and current state: `status.md` (this repo, root)
- Architecture and process decisions: `decisions.md` and `docs/adr/`
  (this repo, root)
- Cost/token accounting design for future real LLM usage (not wired up
  yet): `telemetry.md` (this repo, root)
- Cross-cutting, system-level docs shared across the sibling projects
  (`daily-dose`, `nh-deck`, `nh-skills`): `../Not-Humans-Lab/` — link by
  relative path; content there is not duplicated here.
- Security posture, including the prompt-injection requirement for
  future LLM integration: `SECURITY.md`.

## Community Channels

This is a personal project, not a company product — there is no Slack,
Discord, or forum. The only community channel is this repository's GitHub
Issues (and Discussions, if enabled). If that changes, this section will
be updated.

## How to File a Good Bug Report

A good report lets the maintainer reproduce the problem without a
back-and-forth. Please include:

1. **Which command you ran** — e.g. `npm run pipeline`, `npm run build`,
   `npm run dev`, `npm test`, including any flags or environment
   differences.
2. **What you expected** vs. **what actually happened** — include the
   exact error output or terminal log, not a paraphrase. For pipeline
   failures, include whether the failure happened during the HN fetch,
   the scoring step, or the Zod schema validation.
3. **The date/digest file involved**, if applicable — e.g., which
   `src/data/digest/YYYY-MM-DD/` folder or which per-story file inside it
   (`hn-<hn_id>.json`) is missing, malformed, or causing a build failure.
4. **Environment** — Node.js version (`node -v`) and OS.
5. **How you're running daily-dose** (local clone + `npm install`, or via
   CI) — note that there is currently no hosted deployment to reproduce
   against, since no Vercel project is connected yet (see `status.md`).

Bug reports that are just "it doesn't work" without the above will likely
get a follow-up question before any fix — including the details up front
saves a round trip.

## Response-Time Expectations

- **No guaranteed response time.** This project has no SLA.
- As a rough, non-binding guide: issues are typically triaged (labeled,
  acknowledged) within a couple of weeks, faster if the report is clear
  and actionable.
- Security reports follow the timeline in `SECURITY.md`, which is tighter
  than general support because of the private-disclosure process — use
  that channel, not a public issue, for anything security-related.
- Pull requests fixing an obvious bug with a clear description are
  generally reviewed faster than open-ended feature requests.

## Security Issues

If your question is actually a security concern — a way ingested Hacker
News content (or, later, arXiv abstracts) could be used to manipulate a
future LLM prompt, a schema-validation bypass that lets malformed data
reach the built site, or a supply-chain concern in a dependency — **do
not file a public issue**. Follow the private reporting process in
`SECURITY.md` instead.
