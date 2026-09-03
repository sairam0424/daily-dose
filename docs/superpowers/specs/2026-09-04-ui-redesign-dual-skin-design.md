# daily-dose UI/UX Redesign — Dual-Skin Design System

**Status:** Approved for planning (design sections presented and approved in
chat; this doc formalizes them before `writing-plans`).

## 1. Problem & Goals

The current UI (`src/layouts/Layout.astro` + its consumers) uses default
system fonts, one flat indigo accent (`#4f46e5`), and no real visual
hierarchy beyond `border: 1px solid var(--border)` boxes. The project owner
described it as looking "like a child website." This spec replaces the
entire visual design system with two selectable, fully-designed "skins" —
**Dev-editorial** (dark-only) and **Newspaper** (light+dark) — plus the
mechanism to switch between them, informed by:

- A source-level CSS/HTML audit of `tdd.cat` (arpitbbhayani/the-daily-diff's
  live deployment) — see chat history for the full audit; key takeaway: its
  "premium" feel comes from committing to one coherent metaphor (broadsheet
  newspaper) rendered via a real CSS-custom-property token system, not from
  decoration.
- A deep-research pass on 2026 UI/UX best practices for content-curation/
  digest sites — key takeaway: for many ranked items, flat low-chrome lists
  beat card grids (Console.dev's pattern); pick one deliberate color/density
  register rather than blending styles; WCAG AA (4.5:1 text / 3:1 non-text)
  and font-loading discipline are non-negotiable regardless of aesthetic.

**Goals:** two genuinely distinct, polished visual identities; a persistent,
user-controlled switch between them; no backend/schema changes; no new
external runtime dependency (no CSS framework, no new JS framework).

**Non-goals:** changing what data is shown (no new fields), changing the
pipeline/publish path, adding a third skin, server-side skin detection
(this is a static site — the switch is 100% client-side, like the existing
theme toggle).

## 2. Switching Mechanism

Two independent attributes on `<html>`:

- `data-theme="dark"` (already exists, via `ThemeToggle.astro`) — absent
  means light.
- `data-skin="dev" | "newspaper"` (new) — defaults to `"dev"` for
  first-time visitors (no localStorage entry yet).

Two separate `localStorage` keys: `theme` (existing, unchanged) and `skin`
(new). `ThemeToggle.astro` is renamed to `PreferenceControls.astro` and
gains a second control:

```
[ 🌙/☀️ theme toggle ]  [ Dev | Newspaper skin toggle ]
```

**Forced-dark rule:** when `data-skin="dev"`, the theme toggle button is
`disabled` (with `aria-disabled="true"` and a `title` explaining why) and
`data-theme` is forced to `"dark"` in the same inline bootstrap script that
already prevents flash-of-wrong-theme today. Switching back to
`data-skin="newspaper"` restores whichever `theme` value was in
`localStorage` before Dev mode was entered (i.e. do not overwrite the
`theme` key when forcing dark for Dev mode — only override the *applied*
attribute, not the stored preference).

**Bootstrap script** (inline, in `<head>`, before first paint — extending
the pattern `ThemeToggle.astro`'s script already uses at body level; this
one must move to `<head>` so both attributes are correct before CSS
paints, avoiding a flash of the wrong skin/theme):

```js
const skin = localStorage.getItem('skin') ?? 'dev';
document.documentElement.dataset.skin = skin;
if (skin === 'dev') {
  document.documentElement.dataset.theme = 'dark';
} else if (localStorage.getItem('theme') === 'dark') {
  document.documentElement.dataset.theme = 'dark';
}
```

## 3. Design Token Contract

Every component styles itself only through these custom-property names —
never a skin- or theme-specific name. All three supported combinations
(`dev` implies dark; `newspaper`+light; `newspaper`+dark) define the same
set:

```
--bg-page       page background
--bg-surface    row/card/table background (one step off --bg-page)
--ink           primary text
--ink-soft      secondary text (byline, meta, captions)
--ink-faint     tertiary/decorative only — NOT for body text (see a11y note)
--accent        the one accent color (links, active states, must-read badge)
--accent-ink    text color to use ON a filled --accent background
--rule          hairline divider color (alpha-blended against ink)
--rule-soft     lighter hairline (alpha-blended, ~half of --rule's alpha)
--font-display  the skin's headline/wordmark font stack
--font-body     the skin's body/meta font stack
--font-mono     monospace accent font stack (score numbers, model IDs)
```

**Accessibility note (binding):** `--ink-faint` is for non-text decoration
only (disabled icons, faint borders) because at the values below it does
not reliably clear 4.5:1 against `--bg-page`. Any real reading text (body
copy, labels, meta) must use `--ink` or `--ink-soft`, both of which are
chosen to clear 4.5:1. Before merging, the implementer must verify every
text/background pairing actually used with a contrast checker (e.g.
WebAIM's), because hand-picked hex values below are starting points, not
guaranteed-correct final numbers — treat this as a real verification step,
not a formality.

### 3a. Dev-editorial (dark-only)

```
--bg-page:      #0a0a0c
--bg-surface:   #14141a
--ink:          #e8e6f0
--ink-soft:     #a3a0b8
--ink-faint:    #6b6880   (decoration only — see a11y note)
--accent:       #f5a623
--accent-ink:   #1a1206
--rule:         rgba(232, 230, 240, 0.12)
--rule-soft:    rgba(232, 230, 240, 0.06)
--font-display: 'Space Grotesk', ui-sans-serif, sans-serif
--font-body:    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif
--font-mono:    'JetBrains Mono', ui-monospace, SFMono-Regular, monospace
```

### 3b. Newspaper — light

```
--bg-page:      #ece6d6
--bg-surface:   #f8f4e8
--ink:          #1f1d18
--ink-soft:     #4a4536
--ink-faint:    #857d68   (decoration only)
--accent:       #7a2618
--accent-ink:   #f8f4e8
--rule:         rgba(31, 29, 24, 0.15)
--rule-soft:    rgba(31, 29, 24, 0.08)
--font-display: 'Fraunces', Georgia, serif
--font-body:    'Newsreader', Georgia, serif
--font-mono:    'JetBrains Mono', ui-monospace, monospace
```

### 3c. Newspaper — dark

```
--bg-page:      #16140f
--bg-surface:   #201d16
--ink:          #ddd3ba
--ink-soft:     #a89b7c
--ink-faint:    #6f6551   (decoration only)
--accent:       #c99356
--accent-ink:   #16140f
--rule:         rgba(221, 211, 186, 0.14)
--rule-soft:    rgba(221, 211, 186, 0.07)
--font-display: 'Fraunces', Georgia, serif
--font-body:    'Newsreader', Georgia, serif
--font-mono:    'JetBrains Mono', ui-monospace, monospace
```

Fraunces and Newsreader are deliberately different Google Fonts from
tdd.cat's own Lora/PT Serif pairing — inspired by the newspaper metaphor,
not a clone of its exact typefaces.

## 4. Typography Scale

| Role | Dev-editorial | Newspaper |
|---|---|---|
| Wordmark / masthead H1 | `--font-display` 700, `clamp(1.75rem,4vw,2.25rem)` | `--font-display` 700 (opsz 72), `clamp(2rem,5vw,2.75rem)` |
| Section heading (h2) | `--font-display` 600, `1.1rem`, uppercase, `letter-spacing:0.02em` | `--font-display` 600, `1.2rem`, `letter-spacing:0.01em` (no uppercase — serif caps read fine lowercase-adjacent) |
| Lead-story headline | `--font-display` 600, `1.15rem` | `--font-display` 600 (opsz 36), `clamp(1.4rem,3vw,1.9rem)` |
| Regular story headline | `--font-display` 500, `0.95rem` | `--font-body` 600, `1.05rem` |
| Byline / meta label | `--font-body` 500, `0.7rem`, uppercase, `letter-spacing:0.05em` | `--font-body` 500, `0.72rem`, uppercase, `letter-spacing:0.04em` |
| Body / why-read tooltip text | `--font-body` 400, `0.85rem`, `line-height:1.6` | `--font-body` 400, `0.9rem`, `line-height:1.65` |
| Score / model-ID mono accent | `--font-mono` 500, `0.8rem` | `--font-mono` 500, `0.8rem` |
| Lead-story drop-cap (Newspaper only) | n/a | `--font-display` 700, first-letter `font-size:3em`, `float:left`, `line-height:0.8`, `padding-right:0.08em` |

Line-height rule (from Geist's label-vs-copy distinction, cited in
research): anything that is a single-line label/badge/byline uses a tight
line-height (~1.1–1.3) with letter-spacing; anything that is multi-line
body prose uses a relaxed line-height (1.6+) with no letter-spacing.

## 5. Font Loading

Both skins' font `<link>` tags load unconditionally in `Layout.astro`'s
`<head>` (Google Fonts CSS2 API, `&display=swap`, plus a `preconnect` to
`fonts.gstatic.com`). This is safe because browsers only fetch an
individual font *file* once text actually needs to paint in that
`font-family` — since only one skin's `font-family` values are ever
applied to visible text at a time (the other skin's font names simply
don't appear in any currently-matched CSS rule), idling in one skin never
fetches the other skin's font files. `--font-body` for Dev-editorial is a
system stack (zero fetch, ever) — deliberate, since most on-page text is
body/meta text, keeping the common case fast regardless of skin.

## 6. Component Changes

### `src/layouts/Layout.astro`
- Add the head-level bootstrap script (Section 2).
- Add both skins' Google Fonts `<link>` tags + `preconnect`.
- Replace the existing flat `:root` / `[data-theme='dark']` block with the
  three-way selector structure:
  ```css
  :root, [data-skin='newspaper'] { /* newspaper-light values */ }
  [data-skin='newspaper'][data-theme='dark'] { /* newspaper-dark values */ }
  [data-skin='dev'] { /* dev values — always dark, data-theme irrelevant here */ }
  ```
- Rename every existing `var(--bg)/var(--fg)/var(--muted)/var(--border)/var(--accent)`
  reference in this file's global styles to the new token names
  (`--bg-page`, `--ink`, `--ink-soft`, `--rule`, `--accent`), and set
  `font-family: var(--font-body)` on `body`, `var(--font-display)` on
  `.masthead h1` / `.section-heading`.
- Import `PreferenceControls` instead of `ThemeToggle`.

### `src/components/ThemeToggle.astro` → `src/components/PreferenceControls.astro`
- Keep the existing theme-toggle button and its sun/moon SVGs, unchanged.
- Add a second control: a two-option segmented button group (`Dev` /
  `Newspaper`), `aria-pressed` on whichever is active, styled with the new
  tokens.
- Script: on skin-button click, write `localStorage.setItem('skin', value)`,
  set `document.documentElement.dataset.skin = value`, and if switching to
  `dev`, force `data-theme = 'dark'` (without touching the stored `theme`
  key); if switching to `newspaper`, restore `data-theme` from
  `localStorage.getItem('theme')`. Toggle the theme button's `disabled`/
  `aria-disabled` state to match.

### `src/components/DigestList.astro`
- Restructure the per-item markup:
  - Score/tier badge becomes a real pill: filled `--accent` background +
    `--accent-ink` text for `must-read`; `--accent`-colored 1px border +
    `--accent` text, transparent background for `recommended`; `--rule`
    border + `--ink-soft` text for `notable`. (Tier already computed via
    existing `interestTier()` — no data change.)
  - The item at array index `0` (entries are already sorted
    `interest_score` descending by `groupEntriesByDate()` — see
    `src/lib/digestGrouping.ts`) gets a `lead-story` modifier class: larger
    headline (per Section 4's "Lead-story headline" row), a `"Top Pick"`
    kicker rendered via CSS `content:` on a `::before`, and (Newspaper skin
    only) the drop-cap treatment on the byline/excerpt area. Implement via
    `entries.map((entry, index) => ...)` and pass `index === 0` as a
    conditional class, not a new schema field.
  - `why_read` moves from an always-visible `<p>` to a small info-icon
    `<button>` next to the byline. The button's `aria-label` is the full
    `why_read` string (so screen readers get the content unconditionally,
    regardless of hover/focus state — this preserves `SOUL.md`'s
    AI-transparency/no-hidden-info principle; only the *default visual
    density* changes, not the content's availability). A sibling
    `<span class="why-tooltip" role="tooltip">{why_read}</span>` is
    revealed via pure CSS: `.why-wrap:hover .why-tooltip, .why-wrap:focus-within .why-tooltip { visibility: visible; opacity: 1; }` — no JS, works with keyboard focus via `:focus-within` on a wrapping `<span class="why-wrap">`.
  - Keep the existing `data-source` / `data-interest-tier` attributes on
    the `<li>` unchanged — `FilterBar.astro`'s existing filtering logic
    depends on them and needs no change.

### `src/components/FilterBar.astro`
- Restyle `.filter-btn`/`.filter-btn.active` onto the new tokens
  (`--bg-surface`, `--ink`, `--rule`, `--accent`). No logic change — the
  existing `hidden` attribute toggling on `.story-card` was verified
  compatible with Newspaper's multi-column layout (Section 7): CSS
  multi-column reflows automatically around `display:none`'d
  (`[hidden]`) items, same as it does for any other display change.

### `src/components/DigestChart.astro` (real pre-existing bug, fix as part of this redesign)
- Currently hardcodes `rgba(79, 70, 229, 0.6)` (the *old* flat indigo
  accent) for bars and sets no tick/grid/label color at all — Chart.js's
  own default label color is a dark gray, which is close to invisible
  against Dev-editorial's near-black background or Newspaper-dark's
  ink-dark background today. Fix: read `getComputedStyle(document.documentElement).getPropertyValue('--accent')`
  and `--ink-soft` at runtime (client-side, in the existing `<script type="module">`)
  and pass them into the Chart.js `backgroundColor`/`borderColor` and
  `scales.y.ticks.color` / `scales.x.ticks.color` / `grid.color` options,
  instead of hardcoded values. Re-read on skin/theme change (listen for
  the `PreferenceControls` script's attribute changes via a
  `MutationObserver` on `document.documentElement`'s `data-skin`/
  `data-theme` attributes, and call `chart.update()`) so the chart
  never goes stale after a live switch without a page reload.

### `src/pages/stats.astro`, `src/pages/methodology.astro`
- Restyle onto the new tokens only (bordered-card grid using
  `--bg-surface` + `--rule` hairlines, per tdd.cat's stats-page pattern
  cited in the audit) — no structural/markup rewrite, no data change.

### `src/pages/archive/index.astro`, `src/pages/archive/[date].astro`, `src/pages/index.astro`
- Inherit `Layout`/`DigestList`/`FilterBar` changes automatically; only
  their own inline `<style>` blocks' `var(--border)`/`var(--muted)`/
  `var(--accent)` references need renaming to the new token names (no
  behavior change).

## 7. Verified Non-Conflicts

- **Multi-column vs. FilterBar**: CSS `column-count` layouts reflow
  automatically when a child gets `display:none` (via the `hidden`
  attribute) — same reflow behavior as flexbox/grid. No JS change needed
  in `FilterBar.astro` to support Newspaper's multi-column mode.
- **Font double-loading**: covered in Section 5 — not a real risk given
  how browsers fetch `@font-face` resources on demand.

## 8. Accessibility & Performance

- WCAG AA: 4.5:1 minimum for body/label text, 3:1 minimum for large text
  and non-text UI (borders, focus rings, badge outlines) — verify with a
  contrast checker during implementation per Section 3's binding note.
- `prefers-reduced-motion: reduce` — all new hover/transition CSS must be
  wrapped or use `transition-duration: 0.01ms` under this media query,
  matching this being a from-scratch addition (today's site has almost no
  motion to regress).
- `:focus-visible` states required on every new interactive element
  (skin/theme buttons, why-read info icon, filter pills) using `--accent`
  as the focus ring color — the current site already relies on browser
  default focus rings in most places; this redesign should make them
  intentional instead of default.
- Font loading: `display=swap` on every Google Fonts URL (Section 5);
  no font is loaded that isn't used by the currently-active skin's actual
  rendered text.

## 9. Testing Strategy

- Vitest (extends existing `tests/build-output.test.ts` patterns): assert
  built HTML contains both `data-skin` attribute plumbing (the bootstrap
  script's presence/content), assert the lead-story modifier class lands
  on the entry with the highest `interest_score` in a fixture with mixed
  scores, assert the why-read info button's `aria-label` contains the
  item's real `why_read` text (never empty), assert `PreferenceControls`
  renders both the theme button and the skin segmented control.
- Manual (required before shipping, this is a visual redesign — automated
  tests cannot substitute): click through all three supported combinations
  (Dev-dark, Newspaper-light, Newspaper-dark) on `index`, `archive/`,
  `archive/[date]`, `stats`, `methodology`; verify `FilterBar` filtering
  under Newspaper's multi-column; verify the chart re-colors correctly on
  a live skin/theme switch without reload; spot-check contrast pairs
  against a checker.

## 10. Decisions Log (resolved during brainstorming, recorded here so the
plan doesn't re-litigate them)

- Dev-editorial is dark-only; Newspaper supports light+dark — 3 total
  palettes, not 4 (user-approved, Section 2's forced-dark rule implements
  this).
- Default skin for first-time visitors is Dev-editorial (user-approved).
- Skin switcher lives next to the existing theme toggle in the header, not
  the footer (user-approved).
- `why_read` becomes an on-demand tooltip rather than always-visible body
  text — content is unchanged and still screen-reader-accessible via
  `aria-label` regardless of hover state, so this is a density decision,
  not an honesty/transparency regression under `SOUL.md`'s AI-transparency
  principle (that principle governs whether content is fabricated or
  mislabeled, not its default visual prominence).
- Newspaper's fonts (Fraunces/Newsreader) and exact accent hex values are
  deliberately different from tdd.cat's own (Lora/PT Serif, `#8a1f11`/
  `#cc9a56`) — inspired by, not cloned from, the reference site.
- No `digestSchema.ts` change — lead-story treatment is derived purely
  from existing sort order (`groupEntriesByDate` already sorts by
  `interest_score` descending), not a new field.
