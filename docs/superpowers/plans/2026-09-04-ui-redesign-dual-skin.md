# daily-dose UI/UX Redesign (Dual-Skin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace daily-dose's current unstyled system-font UI with two
selectable, fully-designed visual skins (Dev-editorial dark-only,
Newspaper light+dark), switchable client-side alongside the existing theme
toggle, with zero schema/pipeline changes.

**Architecture:** A new `data-skin` attribute on `<html>` (alongside the
existing `data-theme`), a shared CSS custom-property token contract that
every component styles against, a head-level bootstrap script that applies
both attributes before first paint, and a renamed/extended toggle component
(`ThemeToggle.astro` → `PreferenceControls.astro`).

**Tech Stack:** Astro 5 (`.astro` components, scoped `<style>`, inline
`<script>`), plain CSS custom properties (no framework), Vitest for build-
output assertions, Google Fonts (Space Grotesk, JetBrains Mono, Fraunces,
Newsreader).

**Spec:** `docs/superpowers/specs/2026-09-04-ui-redesign-dual-skin-design.md`

**Revision note:** this plan was adversarially reviewed against the spec
(automated multi-dimension review + direct empirical browser testing)
before execution. Every fix from that review is folded into the tasks
below — see inline "(review fix)" markers. The two most consequential
findings:

1. **A real, verified-in-browser layout bug**: `.story-list` inherits
   `display: flex` from its base rule; without an explicit `display: block`
   reset under `[data-skin='newspaper']`, `column-count` has **zero effect**
   (confirmed via Playwright: cards rendered full-width and stacked, not
   columnized, until the reset was added). Task 3 below includes the fix.
2. Once that fix is applied, multi-column layout correctly reflows around
   `hidden` items with no JS changes, and `column-span: all` correctly
   pulls the lead story full-width — both **confirmed empirically** in a
   real browser, not assumed from spec-reading.

## Global Constraints

- Every component styles itself only through the token names in the spec's
  Section 3 contract (`--bg-page`, `--bg-surface`, `--ink`, `--ink-soft`,
  `--ink-faint`, `--accent`, `--accent-ink`, `--rule`, `--rule-soft`,
  `--font-display`, `--font-body`, `--font-mono`) — never a skin-specific
  name. `--ink-faint` and `--rule-soft` are real, used tokens in this
  revision (decorative icon color and a softer divider respectively — see
  Task 2) — not decorative-only placeholders left unconsumed.
- `--ink-faint` is decoration-only, never used for real reading text (a11y
  binding note, spec Section 3).
- Dev-editorial is dark-only; the theme toggle is disabled while it's
  active. Newspaper supports light+dark. Default skin for first-time
  visitors (no `localStorage` entry) is `dev`.
- No changes to `src/lib/digestSchema.ts`, `scripts/pipeline.ts`, or any
  other publish-path file — this plan is presentation-only.
- `[data-skin='dev']`'s CSS rule block MUST appear in source order AFTER
  the `:root, [data-skin='newspaper']` block — both have equal specificity
  (0,1,0) against `<html data-skin="dev">` (`:root` always matches the
  root element regardless of its attributes), so later source order is
  what makes Dev's values win. Reordering these two blocks silently
  breaks Dev-editorial.
- Inline bootstrap script in `Layout.astro`'s `<head>` must use Astro's
  `is:inline` directive so it renders as a literal, non-module,
  synchronously-executing `<script>` — without it, Astro adds
  `type="module"` and defers it, reintroducing the flash-of-wrong-skin bug
  this script exists to prevent.
- **(review fix) Contrast is verified now, in this document, not deferred.**
  All three palettes' text/background pairings were computed with the
  real WCAG relative-luminance formula before this plan was finalized:

  | Pairing | Dev | Newspaper-light | Newspaper-dark | Floor |
  |---|---|---|---|---|
  | `--ink` on `--bg-page` | 16.0:1 | 13.5:1 | 12.4:1 | 4.5:1 |
  | `--ink-soft` on `--bg-page` | 7.8:1 | 7.7:1 | 6.7:1 | 4.5:1 |
  | `--ink-faint` on `--bg-page` | 3.7:1 | 3.3:1 | 3.2:1 | 3:1 (decoration/large-text only, per binding a11y note) |
  | `--ink` on `--bg-surface` | 14.9:1 | 15.3:1 | 11.3:1 | 4.5:1 |
  | `--ink-soft` on `--bg-surface` | 7.2:1 | 8.7:1 | 6.1:1 | 4.5:1 |
  | `--accent` on `--bg-page` | 9.8:1 | 8.0:1 | 6.8:1 | 4.5:1 |
  | `--accent` on `--bg-surface` | 9.1:1 | 9.0:1 | 6.2:1 | 4.5:1 |
  | `--accent-ink` on `--accent` | 9.1:1 | 9.0:1 | 6.8:1 | 4.5:1 |

  Every pairing clears its floor with margin. `--ink-faint` intentionally
  sits in the 3:1-4.5:1 band, which is why it is restricted to decoration
  (icon glyphs) rather than reading text — this is the binding rule, not a
  future TODO.

## File Structure

| File | Change |
|---|---|
| `src/layouts/Layout.astro` | Rewrite `:root`/`[data-theme='dark']` block into the 3-way token system + legacy aliases + skin-scoped typography overrides; add head bootstrap script; add font `<link>`s; import `PreferenceControls` |
| `src/components/ThemeToggle.astro` | Deleted (replaced by `PreferenceControls.astro`) |
| `src/components/PreferenceControls.astro` | New — theme button (unchanged behavior) + skin segmented control + forced-dark logic. Created in the **same task** as `Layout.astro` (review fix — see Task 1) |
| `src/components/DigestList.astro` | Badge-pill markup, lead-story (`index === 0`) modifier, why-read tooltip, Dev-skin CSS (Task 2), Newspaper-skin CSS (Task 3: multi-column with the `display: block` fix, drop-cap, per-skin typography overrides) |
| `src/components/DigestChart.astro` | Read `--accent`/`--ink-soft` from computed style at runtime instead of hardcoded colors; re-render on skin/theme change |
| `src/components/FilterBar.astro` | Restyle onto new tokens, no logic change |
| `src/pages/stats.astro` | Restyle onto new tokens (bordered-card grid, hairline dividers), no structural change |
| `src/pages/methodology.astro` | Restyle onto new tokens, no structural change |
| `src/pages/archive/index.astro` | Restyle inline `<style>` block onto new tokens |
| `src/pages/archive/[date].astro` | **(review fix)** No token rename needed — its only `var()` reference is `--accent`, which is unchanged. Add `font-family: var(--font-body)` only. |
| `tests/build-output.test.ts` | New assertions for bootstrap script, `PreferenceControls` markup, lead-story class, why-read tooltip |
| `tests/legacy-tokens.test.ts` | New — regression guard that no `.astro` file references the old `--bg`/`--fg`/`--muted`/`--border` names after Phase 4. **(review fix)** This test and the temporary alias block in Task 1 are a plan-level engineering decision to stage the spec's one-shot rename across 4 separate PRs safely — the spec itself only asked for a direct rename; this plan chooses to phase it, and this file exists to make that phasing safe, not to reintroduce drift. |

---

## Phase 1 — Token infrastructure & preference controls (own PR)

### Task 1: Layout.astro + PreferenceControls.astro together

**(review fix, critical):** the original draft of this plan split this
into two tasks — Task 1 made `Layout.astro` import and render
`<PreferenceControls />` before Task 2 created that file, which would have
made `npm run build` fail with an unresolved-import error the moment Task
1 alone was committed (Vite/Rollup resolves local imports eagerly; a
missing file is a hard build error, not a soft assertion failure). These
two files are not independently testable — `Layout.astro` cannot build
without `PreferenceControls.astro` existing, so per the writing-plans
rule that a task boundary should exist only where "a reviewer could
meaningfully reject one task while approving its neighbor," they are one
task.

**Files:**
- Create: `src/components/PreferenceControls.astro`
- Modify: `src/layouts/Layout.astro`
- Delete: `src/components/ThemeToggle.astro`
- Test: `tests/build-output.test.ts`

**Interfaces:**
- Produces: the token contract (`--bg-page`, `--bg-surface`, `--ink`,
  `--ink-soft`, `--ink-faint`, `--accent`, `--accent-ink`, `--rule`,
  `--rule-soft`, `--font-display`, `--font-body`, `--font-mono`) that
  every later task consumes — including `--ink-faint` and `--rule-soft`,
  which THIS task's own `PreferenceControls.astro` consumes directly (see
  Step 3), so the claim is verified true by this task's own code, not left
  for later tasks to eventually use. Also produces legacy aliases
  (`--bg`, `--fg`, `--muted`, `--border`) so untouched components keep
  working until Phase 4. Produces `#theme-toggle`, `#skin-toggle-dev`,
  `#skin-toggle-newspaper` button ids.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing tests**

Add to `tests/build-output.test.ts` (new `it` blocks inside the existing
`describe("dist/index.html build output", ...)`):

```ts
  it("bootstraps skin and theme from localStorage before paint via an inline head script", () => {
    const headMatch = html.match(/<head[^>]*>[\s\S]*?<\/head>/i);
    expect(headMatch, "expected a <head> section").toBeTruthy();
    const head = headMatch![0];
    expect(head).toContain("documentElement.dataset.skin");
    expect(head).toContain("localStorage.getItem(\"skin\")");
  });

  it("loads all four redesign Google Fonts", () => {
    expect(html).toContain("Space+Grotesk");
    expect(html).toContain("JetBrains+Mono");
    expect(html).toContain("Fraunces");
    expect(html).toContain("Newsreader");
  });

  it("renders the skin segmented control defaulting to Dev-editorial with the theme toggle disabled", () => {
    expect(html).toMatch(/id="skin-toggle-dev"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/id="skin-toggle-newspaper"[^>]*aria-pressed="false"/);
    expect(html).toMatch(/id="theme-toggle"[^>]*disabled/);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run build && npx vitest run tests/build-output.test.ts -t "bootstraps skin"`
Expected: FAIL (`head.toContain` finds nothing — none of this exists yet).

- [ ] **Step 3: Create `PreferenceControls.astro`**

`src/components/PreferenceControls.astro`:

```astro
---
---

<div class="preference-controls">
  <button
    id="theme-toggle"
    type="button"
    class="theme-toggle"
    aria-label="Toggle dark mode"
    disabled
    aria-disabled="true"
    title="Theme is fixed in Dev-editorial mode"
  >
    <svg class="icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="5"></circle>
      <line x1="12" y1="1" x2="12" y2="3"></line>
      <line x1="12" y1="21" x2="12" y2="23"></line>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
      <line x1="1" y1="12" x2="3" y2="12"></line>
      <line x1="21" y1="12" x2="23" y2="12"></line>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
    </svg>
    <svg class="icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
    </svg>
  </button>
  <div class="skin-toggle" role="group" aria-label="Visual style">
    <button id="skin-toggle-dev" type="button" class="skin-btn" data-skin-value="dev" aria-pressed="true">Dev</button>
    <button id="skin-toggle-newspaper" type="button" class="skin-btn" data-skin-value="newspaper" aria-pressed="false">Newspaper</button>
  </div>
</div>

<style>
  .preference-controls {
    position: fixed;
    top: 1rem;
    right: 1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    z-index: 10;
  }

  .theme-toggle {
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 50%;
    border: 1px solid var(--rule);
    background: var(--bg-surface);
    color: var(--ink);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  /* Uses --ink-faint deliberately: this is a disabled decorative icon,
     not reading text, so the 3:1-tier token is the correct choice here. */
  .theme-toggle:disabled {
    color: var(--ink-faint);
    cursor: not-allowed;
  }

  .icon-moon {
    display: none;
  }

  :global([data-theme='dark']) .icon-sun {
    display: none;
  }

  :global([data-theme='dark']) .icon-moon {
    display: block;
  }

  .skin-toggle {
    display: flex;
    border: 1px solid var(--rule);
    border-radius: 999px;
    overflow: hidden;
  }

  /* Uses --rule-soft: a softer internal divider between the two segmented
     buttons than the outer --rule border. */
  .skin-btn:first-child {
    border-right: 1px solid var(--rule-soft);
  }

  .skin-btn {
    border: none;
    background: var(--bg-surface);
    color: var(--ink-soft);
    font-family: var(--font-body);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0.35rem 0.65rem;
    cursor: pointer;
  }

  .skin-btn[aria-pressed='true'] {
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 600;
  }

  .skin-btn:focus-visible,
  .theme-toggle:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: no-preference) {
    .theme-toggle,
    .skin-btn {
      transition: background-color 0.15s ease, color 0.15s ease, opacity 0.15s ease;
    }
  }
</style>

<script>
  const THEME_KEY = 'theme';
  const SKIN_KEY = 'skin';

  const themeButton = document.getElementById('theme-toggle') as HTMLButtonElement | null;
  const devButton = document.getElementById('skin-toggle-dev') as HTMLButtonElement | null;
  const newspaperButton = document.getElementById('skin-toggle-newspaper') as HTMLButtonElement | null;

  function currentSkin(): string {
    return document.documentElement.dataset.skin ?? 'dev';
  }

  function syncControls() {
    const isDev = currentSkin() === 'dev';
    if (themeButton) {
      themeButton.disabled = isDev;
      themeButton.toggleAttribute('aria-disabled', isDev);
      themeButton.title = isDev
        ? 'Theme is fixed in Dev-editorial mode'
        : 'Toggle dark mode';
    }
    devButton?.setAttribute('aria-pressed', String(isDev));
    newspaperButton?.setAttribute('aria-pressed', String(!isDev));
  }

  function setSkin(skin: 'dev' | 'newspaper') {
    document.documentElement.dataset.skin = skin;
    localStorage.setItem(SKIN_KEY, skin);
    if (skin === 'dev') {
      document.documentElement.dataset.theme = 'dark';
    } else if (localStorage.getItem(THEME_KEY) === 'dark') {
      document.documentElement.dataset.theme = 'dark';
    } else {
      delete document.documentElement.dataset.theme;
    }
    syncControls();
  }

  devButton?.addEventListener('click', () => setSkin('dev'));
  newspaperButton?.addEventListener('click', () => setSkin('newspaper'));

  themeButton?.addEventListener('click', () => {
    if (currentSkin() === 'dev') return;
    const isDark = document.documentElement.dataset.theme === 'dark';
    if (isDark) {
      delete document.documentElement.dataset.theme;
      localStorage.setItem(THEME_KEY, 'light');
    } else {
      document.documentElement.dataset.theme = 'dark';
      localStorage.setItem(THEME_KEY, 'dark');
    }
  });

  // Reconcile with the head bootstrap script's applied state (handles
  // returning visitors whose stored skin/theme differ from this
  // component's default-rendered markup).
  syncControls();
</script>
```

- [ ] **Step 4: Rewrite `Layout.astro`**

```astro
---
import Analytics from '@vercel/analytics/astro';
import SiteMeta from '../components/SiteMeta.astro';
import PreferenceControls from '../components/PreferenceControls.astro';

interface Props {
  title: string;
  description: string;
  path: string;
  includeRssLink?: boolean;
}

const { title, description, path, includeRssLink = true } = Astro.props;
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{title}</title>
    <SiteMeta title={title} description={description} path={path} />
    {includeRssLink && (
      <link rel="alternate" type="application/rss+xml" title="daily-dose" href="/rss.xml" />
    )}
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@500&family=Fraunces:opsz,wght@9..144,400..700&family=Newsreader:ital,wght@0,400;0,500;0,600;1,400&display=swap"
    />
    <script is:inline>
      (function () {
        var skin = localStorage.getItem("skin") || "dev";
        document.documentElement.dataset.skin = skin;
        if (skin === "dev") {
          document.documentElement.dataset.theme = "dark";
        } else if (localStorage.getItem("theme") === "dark") {
          document.documentElement.dataset.theme = "dark";
        }
      })();
    </script>
  </head>
  <body>
    <Analytics />
    <PreferenceControls />
    <slot />
    <style is:global>
      :root,
      [data-skin='newspaper'] {
        color-scheme: light dark;
        --bg-page: #ece6d6;
        --bg-surface: #f8f4e8;
        --ink: #1f1d18;
        --ink-soft: #4a4536;
        --ink-faint: #857d68;
        --accent: #7a2618;
        --accent-ink: #f8f4e8;
        --rule: rgba(31, 29, 24, 0.15);
        --rule-soft: rgba(31, 29, 24, 0.08);
        --font-display: 'Fraunces', Georgia, serif;
        --font-body: 'Newsreader', Georgia, serif;
        --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;
      }

      [data-skin='newspaper'][data-theme='dark'] {
        --bg-page: #16140f;
        --bg-surface: #201d16;
        --ink: #ddd3ba;
        --ink-soft: #a89b7c;
        --ink-faint: #6f6551;
        --accent: #c99356;
        --accent-ink: #16140f;
        --rule: rgba(221, 211, 186, 0.14);
        --rule-soft: rgba(221, 211, 186, 0.07);
      }

      /* Must stay AFTER the block above — see Global Constraints. */
      [data-skin='dev'] {
        --bg-page: #0a0a0c;
        --bg-surface: #14141a;
        --ink: #e8e6f0;
        --ink-soft: #a3a0b8;
        --ink-faint: #6b6880;
        --accent: #f5a623;
        --accent-ink: #1a1206;
        --rule: rgba(232, 230, 240, 0.12);
        --rule-soft: rgba(232, 230, 240, 0.06);
        --font-display: 'Space Grotesk', ui-sans-serif, sans-serif;
        --font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;
      }

      /* Legacy aliases for components not yet migrated to the new token
         names — removed in Phase 4 Task 8 once nothing references them.
         (This staged rollout is a plan-level choice; the spec itself asks
         for a direct one-shot rename — see File Structure table.) */
      :root {
        --bg: var(--bg-page);
        --fg: var(--ink);
        --muted: var(--ink-soft);
        --border: var(--rule);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: var(--font-body);
        background: var(--bg-page);
        color: var(--ink);
        line-height: 1.5;
      }

      .masthead {
        padding: 2rem 1.5rem 1rem;
        border-bottom: 1px solid var(--rule);
      }

      .site-nav {
        display: flex;
        gap: 1rem;
      }

      .site-nav a {
        color: var(--accent);
        text-decoration: none;
        font-size: 0.9rem;
        font-family: var(--font-body);
      }

      .site-nav a:hover {
        text-decoration: underline;
      }

      .masthead h1 {
        margin: 0.5rem 0 0;
        font-family: var(--font-display);
        font-optical-sizing: auto;
        font-weight: 700;
        font-size: clamp(1.75rem, 4vw, 2.25rem);
      }

      /* (review fix) Newspaper's masthead is deliberately larger, per
         spec Section 4's typography table — font-optical-sizing:auto
         above already makes Fraunces' opsz axis track this larger size
         automatically; only the size itself needs a skin override. */
      :global([data-skin='newspaper']) .masthead h1 {
        font-size: clamp(2rem, 5vw, 2.75rem);
      }

      .tagline {
        margin: 0.25rem 0 0;
        color: var(--ink-soft);
        font-family: var(--font-body);
      }

      main {
        max-width: 800px;
        margin: 0 auto;
        padding: 1.5rem;
      }

      .section-heading {
        font-family: var(--font-display);
        font-optical-sizing: auto;
        font-weight: 600;
        font-size: 1.1rem;
        text-transform: uppercase;
        letter-spacing: 0.02em;
        margin-top: 2rem;
      }

      /* (review fix) Newspaper section headings read fine lower-case-
         adjacent in a serif — spec Section 4 drops the uppercase
         treatment and uses a slightly larger size/looser tracking. */
      :global([data-skin='newspaper']) .section-heading {
        font-size: 1.2rem;
        text-transform: none;
        letter-spacing: 0.01em;
      }

      .empty-state {
        color: var(--ink-soft);
      }

      .site-footer {
        max-width: 800px;
        margin: 2rem auto 0;
        padding: 1.25rem 1.5rem 2rem;
        border-top: 3px double var(--rule);
        color: var(--ink-soft);
        font-size: 0.8rem;
        text-align: center;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        font-family: var(--font-body);
      }

      .site-footer a {
        color: var(--accent);
      }
    </style>
  </body>
</html>
```

Delete `src/components/ThemeToggle.astro`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run build && npx vitest run`
Expected: ALL tests pass, including the pre-existing
`'has a real theme toggle button with a persistence script'` test (the
button keeps `id="theme-toggle"` and the script still uses `localStorage`)
and the three new tests from Step 1. Because both files exist together in
this single task, there is no intermediate state where the build fails.

- [ ] **Step 6: Commit**

```bash
git add src/components/PreferenceControls.astro src/layouts/Layout.astro tests/build-output.test.ts
git rm src/components/ThemeToggle.astro
git commit -m "feat: add dual-skin design tokens, bootstrap script, and skin/theme switcher"
```

---

## Phase 2 — DigestList redesign (own PR)

### Task 2: Badge pills, lead-story treatment, why-read tooltip, Dev-editorial CSS

**Files:**
- Modify: `src/components/DigestList.astro`
- Test: `tests/build-output.test.ts`

**Interfaces:**
- Consumes: `interestTier()` from `src/lib/interestTier.ts` (unchanged),
  `formatReadingBadge()` from `src/lib/readingTime.ts` (unchanged), tokens
  from Task 1 including `--ink-faint` (used below for the why-icon's
  default color, a decorative glyph — not reading text) and `--rule-soft`
  (used for the `notable`-tier badge border).
- Produces: `.story-card.lead-story` modifier class on the entry at array
  index 0; `.story-title`, `.story-meta`, `.score-badge`, `.why-tooltip`
  class names that Task 3's Newspaper-only overrides target — do not
  rename any of them without updating Task 3.

- [ ] **Step 1: Write the failing tests**

Add to `tests/build-output.test.ts`:

```ts
  it("marks the highest-scored story as the lead story", () => {
    const items = findJsonFiles(DIGEST_BASE).map((filePath) =>
      DigestItemSchema.parse(JSON.parse(readFileSync(filePath, "utf-8"))),
    );
    const topItem = [...items].sort((a, b) => b.interest_score - a.interest_score)[0];
    expect(topItem, "expected at least one committed digest item").toBeTruthy();

    const leadMatch = html.match(/<li class="story-card lead-story"[^>]*>[\s\S]*?<\/li>/);
    expect(leadMatch, "expected a .lead-story <li>").toBeTruthy();
    expect(leadMatch![0]).toContain(topItem!.title);
  });

  it("(review fix) uses the exact why_read string as the info button's accessible label", () => {
    const items = findJsonFiles(DIGEST_BASE).map((filePath) =>
      DigestItemSchema.parse(JSON.parse(readFileSync(filePath, "utf-8"))),
    );
    const sample = items[0];
    // Deliberately includes a short context prefix ("Why this made the
    // cut: ") rather than the bare why_read string alone — a raw
    // sentence with no label is worse for screen-reader users than one
    // with context, per general ARIA-label practice. This is a
    // documented, intentional refinement over the spec's literal "the
    // full why_read string" wording, not an oversight (spec Section 6).
    expect(html).toContain(`aria-label="Why this made the cut: ${sample.why_read}"`);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run build && npx vitest run tests/build-output.test.ts -t "lead story"`
Expected: FAIL — no `.lead-story` class exists yet.

- [ ] **Step 3: Rewrite the component**

`src/components/DigestList.astro`:

```astro
---
import type { CollectionEntry } from 'astro:content';
import { interestTier } from '../lib/interestTier.js';
import { formatReadingBadge } from '../lib/readingTime.js';

interface Props {
  entries: CollectionEntry<'digest'>[];
}

const { entries } = Astro.props;
---

<ul class="story-list">
  {entries.map((entry, index) => (
    <li
      class={`story-card${index === 0 ? ' lead-story' : ''}`}
      data-source={entry.data.source}
      data-interest-tier={interestTier(entry.data.interest_score)}
    >
      <a class="story-title" href={entry.data.url} target="_blank" rel="noopener noreferrer">
        {entry.data.title}
      </a>
      <div class="story-meta">
        <span class={`source-badge source-badge-${entry.data.source}`}>{entry.data.source}</span>
        <span class={`score-badge score-badge-${interestTier(entry.data.interest_score)}`}>
          {entry.data.interest_score.toFixed(1)}
        </span>
        <span class="reading-badge">{formatReadingBadge(entry.data)}</span>
        {typeof entry.data.points === 'number' && (
          <span class="points">{entry.data.points} points</span>
        )}
        <span class="why-wrap">
          <button type="button" class="why-icon" aria-label={`Why this made the cut: ${entry.data.why_read}`}>
            &#9432;
          </button>
          <span class="why-tooltip" role="tooltip">{entry.data.why_read}</span>
        </span>
        {typeof entry.data.hn_id === 'number' && (
          <a
            class="discuss-link"
            href={`https://news.ycombinator.com/item?id=${entry.data.hn_id}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Discuss &rarr;
          </a>
        )}
      </div>
    </li>
  ))}
</ul>

<style>
  .story-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .story-card {
    padding: 0.85rem 0;
    border-bottom: 1px solid var(--rule);
  }

  .story-card:first-child {
    padding-top: 0;
  }

  /* Dev-editorial headline (default/unscoped values). */
  .story-title {
    font-family: var(--font-display);
    font-size: 0.95rem;
    font-weight: 500;
    color: var(--ink);
    text-decoration: none;
  }

  .story-title:hover {
    color: var(--accent);
    text-decoration: underline;
  }

  .lead-story .story-title {
    font-size: 1.15rem;
    font-weight: 600;
    display: block;
  }

  .lead-story .story-title::before {
    content: 'Top Pick';
    display: block;
    font-family: var(--font-body);
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--accent);
    margin-bottom: 0.3rem;
  }

  /* Byline row — Dev-editorial values (Task 3 overrides for Newspaper). */
  .story-meta {
    margin-top: 0.4rem;
    display: flex;
    gap: 0.6rem;
    align-items: center;
    flex-wrap: wrap;
    font-family: var(--font-body);
    font-size: 0.7rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ink-soft);
  }

  .source-badge {
    text-transform: uppercase;
    font-weight: 600;
    letter-spacing: 0.04em;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    border: 1px solid var(--rule);
    color: var(--ink-soft);
  }

  /* Score/model-ID mono accent: 0.8rem for BOTH skins per spec Section 4
     (identical row) — a flat, unscoped value is correct here, not a gap. */
  .score-badge {
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 0.8rem;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
  }

  .score-badge-must-read {
    background: var(--accent);
    color: var(--accent-ink);
  }

  .score-badge-recommended {
    border: 1px solid var(--accent);
    color: var(--accent);
  }

  /* Uses --rule-soft (softer than the source-badge's --rule border) since
     "notable" is deliberately the least visually emphasized tier. */
  .score-badge-notable {
    border: 1px solid var(--rule-soft);
    color: var(--ink-soft);
  }

  .reading-badge {
    font-style: italic;
  }

  .why-wrap {
    position: relative;
    display: inline-flex;
  }

  /* Uses --ink-faint: this is a decorative glyph, not reading text. */
  .why-icon {
    border: none;
    background: none;
    color: var(--ink-faint);
    cursor: pointer;
    font-size: 0.85rem;
    line-height: 1;
    padding: 0;
  }

  .why-icon:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* Tooltip body text — Dev-editorial values (Task 3 overrides for Newspaper). */
  .why-tooltip {
    position: absolute;
    bottom: 100%;
    left: 0;
    margin-bottom: 0.4rem;
    width: max-content;
    max-width: 260px;
    background: var(--bg-surface);
    border: 1px solid var(--rule);
    border-radius: 6px;
    padding: 0.5rem 0.6rem;
    font-family: var(--font-body);
    font-size: 0.85rem;
    line-height: 1.6;
    color: var(--ink);
    visibility: hidden;
    opacity: 0;
    pointer-events: none;
    z-index: 5;
  }

  .why-wrap:hover .why-tooltip,
  .why-wrap:focus-within .why-tooltip {
    visibility: visible;
    opacity: 1;
  }

  @media (prefers-reduced-motion: no-preference) {
    .why-tooltip {
      transition: opacity 0.15s ease;
    }
  }

  .discuss-link {
    color: var(--accent);
    text-decoration: none;
  }

  .discuss-link:hover {
    text-decoration: underline;
  }
</style>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run build && npx vitest run`
Expected: all tests pass, including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add src/components/DigestList.astro tests/build-output.test.ts
git commit -m "feat: redesign story list with badge pills, lead story, and why-read tooltip"
```

### Task 3: Newspaper skin CSS for DigestList (multi-column, drop-cap, typography)

**Files:**
- Modify: `src/components/DigestList.astro` (append to existing `<style>`
  block only — no markup change)
- Test: `tests/build-output.test.ts`

**Interfaces:**
- Consumes: `.story-list`, `.story-card`, `.lead-story`, `.story-title`,
  `.story-meta`, `.why-tooltip` (all produced by Task 2 — this task adds
  `[data-skin='newspaper']`-scoped overrides to each; it does not touch
  `.why-wrap` itself, only its `.why-tooltip` child).

- [ ] **Step 1: Write the failing test**

```ts
  it("applies a multi-column layout to the story list only under the Newspaper skin, with display reset from the shared flex base", () => {
    const styleMatch = html.match(/<style[^>]*>[\s\S]*?story-list[\s\S]*?<\/style>/);
    expect(styleMatch, "expected a <style> block defining .story-list rules").toBeTruthy();
    const style = styleMatch![0];
    expect(style).toContain("[data-skin='newspaper']");
    expect(style).toContain("column-count");
    // (review fix, critical) .story-list's base rule sets display:flex;
    // without an explicit reset here, column-count has zero effect —
    // verified empirically in a real browser during plan review.
    expect(style).toMatch(/\[data-skin='newspaper'\][^{]*\.story-list\s*\{[^}]*display:\s*block/);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && npx vitest run tests/build-output.test.ts -t "multi-column"`
Expected: FAIL — no such rule exists yet.

- [ ] **Step 3: Append Newspaper-only rules**

Append to `src/components/DigestList.astro`'s existing `<style>` block
(after the rules Task 2 added, same file):

```css
  /* (review fix, critical) .story-list's base rule (Task 2) sets
     display:flex — column-count is silently ignored on flex containers
     per the CSS Multi-column spec. This reset is required, not optional;
     confirmed empirically (Playwright) during plan review: omitting it
     renders every card full-width and stacked, with zero columnization. */
  :global([data-skin='newspaper']) .story-list {
    display: block;
    column-count: 3;
    column-gap: 2rem;
    column-rule: 1px solid var(--rule);
  }

  :global([data-skin='newspaper']) .story-card {
    break-inside: avoid;
  }

  @media (max-width: 1000px) {
    :global([data-skin='newspaper']) .story-list {
      column-count: 2;
    }
  }

  @media (max-width: 640px) {
    :global([data-skin='newspaper']) .story-list {
      column-count: 1;
    }
  }

  /* column-span:all pulls the lead story out of the column flow to span
     full width above the columns — confirmed empirically (Playwright):
     once display:block above is in effect, the lead story renders at
     full list width and the remaining visible cards distribute evenly
     into 3 (or 2/1, responsively) columns. break-inside:auto overrides
     the general .story-card break-inside:avoid rule for this element
     specifically, since a full-width spanning element has no column to
     avoid breaking inside of. */
  :global([data-skin='newspaper']) .lead-story {
    column-span: all;
    break-inside: auto;
    margin-bottom: 1rem;
  }

  :global([data-skin='newspaper']) .story-title {
    font-family: var(--font-body);
    font-size: 1.05rem;
    font-weight: 600;
  }

  :global([data-skin='newspaper']) .lead-story .story-title {
    font-family: var(--font-display);
    font-optical-sizing: auto;
    font-size: clamp(1.4rem, 3vw, 1.9rem);
  }

  /* (review fix, documented deviation) Spec Section 6 describes the
     drop-cap as living on the "byline/excerpt area." This component's
     byline (.story-meta) is a flex row of badge <span> elements, not
     flowing prose text — ::first-letter requires real text content at
     the start of the element's own text, and does not reliably target
     text nested inside a first inline child across browsers. The
     headline is the only element in this component with real flowing
     text, so the drop-cap is applied there instead — a deliberate,
     technically-motivated substitution, not an oversight. */
  :global([data-skin='newspaper']) .lead-story .story-title::first-letter {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 2.6em;
    float: left;
    line-height: 0.8;
    padding-right: 0.08em;
  }

  :global([data-skin='newspaper']) .story-meta {
    font-size: 0.72rem;
    letter-spacing: 0.04em;
  }

  :global([data-skin='newspaper']) .why-tooltip {
    font-size: 0.9rem;
    line-height: 1.65;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run build && npx vitest run`
Expected: all pass.

- [ ] **Step 5: Manual verification (required — this is the plan's most
  layout-sensitive change and automated string-matching on CSS text
  cannot confirm actual rendered geometry)**

Run `npm run dev`, switch to Newspaper skin, and visually confirm: the
lead story spans full width above 3 (desktop) columns; narrowing the
viewport drops to 2 then 1 column at the documented breakpoints; filtering
via `FilterBar` with items hidden mid-list does not leave visually broken
gaps (columns rebalance around hidden items automatically — this was
confirmed in isolation during plan review, but confirm again against the
real component + real data here).

- [ ] **Step 6: Commit**

```bash
git add src/components/DigestList.astro tests/build-output.test.ts
git commit -m "feat: add Newspaper skin multi-column layout and typography to story list"
```

---

## Phase 3 — DigestChart dynamic coloring (own PR)

### Task 4: Fix hardcoded chart colors, re-render on skin/theme change

**Files:**
- Modify: `src/components/DigestChart.astro`
- Test: `tests/build-output.test.ts` (regression-only; Chart.js's own
  rendering is client-side and not exercised by the SSR-output test suite)

**Interfaces:**
- Consumes: `--accent`, `--ink-soft`, `--rule` (read via
  `getComputedStyle` at runtime, not imported).

- [ ] **Step 1: Write the failing test**

```ts
  it("keeps the score chart canvas present after the redesign (regression check)", () => {
    expect(html).toContain('id="score-chart"');
    expect(html).not.toContain("rgba(79, 70, 229"); // old hardcoded indigo
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && npx vitest run tests/build-output.test.ts -t "regression check"`
Expected: FAIL — the old hardcoded color string is still present.

- [ ] **Step 3: Rewrite the client script**

`src/components/DigestChart.astro`:

```astro
---
interface Props {
  labels: string[];
  scores: number[];
}

const { labels, scores } = Astro.props;
const chartDataJson = JSON.stringify({ labels, scores });
---

<canvas id="score-chart" data-chart={chartDataJson} width="600" height="320"></canvas>

<script type="module">
  import Chart from 'chart.js/auto';

  const canvas = document.getElementById('score-chart');
  if (canvas instanceof HTMLCanvasElement) {
    const raw = canvas.dataset.chart;
    const { labels, scores } = raw ? JSON.parse(raw) : { labels: [], scores: [] };

    function readToken(name) {
      return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }

    function buildChartColors() {
      const accent = readToken('--accent') || '#4f46e5';
      const inkSoft = readToken('--ink-soft') || '#6b7280';
      const rule = readToken('--rule') || 'rgba(107, 114, 128, 0.2)';
      return { accent, inkSoft, rule };
    }

    let colors = buildChartColors();

    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Interest score',
            data: scores,
            backgroundColor: colors.accent,
            borderColor: colors.accent,
            borderWidth: 1,
          },
        ],
      },
      options: {
        scales: {
          y: {
            beginAtZero: true,
            max: 10,
            ticks: { color: colors.inkSoft },
            grid: { color: colors.rule },
          },
          x: {
            ticks: { color: colors.inkSoft },
            grid: { color: colors.rule },
          },
        },
        plugins: {
          legend: { labels: { color: colors.inkSoft } },
        },
      },
    });

    const observer = new MutationObserver(() => {
      colors = buildChartColors();
      chart.data.datasets[0].backgroundColor = colors.accent;
      chart.data.datasets[0].borderColor = colors.accent;
      chart.options.scales.y.ticks.color = colors.inkSoft;
      chart.options.scales.y.grid.color = colors.rule;
      chart.options.scales.x.ticks.color = colors.inkSoft;
      chart.options.scales.x.grid.color = colors.rule;
      if (chart.options.plugins?.legend?.labels) {
        chart.options.plugins.legend.labels.color = colors.inkSoft;
      }
      chart.update();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-skin', 'data-theme'] });
  }
</script>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run build && npx vitest run`
Expected: all pass.

- [ ] **Step 5: Manual verification (required — Chart.js runtime behavior
  is not covered by the automated suite)**

Run `npm run dev`, switch skins and themes, confirm the chart's
bars/ticks/gridlines recolor live without a page reload, and are legible
against both Dev-editorial's near-black background and Newspaper-dark's
ink-dark background.

- [ ] **Step 6: Commit**

```bash
git add src/components/DigestChart.astro tests/build-output.test.ts
git commit -m "fix: read chart colors from active skin/theme instead of a hardcoded value"
```

---

## Phase 4 — Remaining components, legacy token cleanup (own PR)

### Task 5: FilterBar.astro restyle

**Files:**
- Modify: `src/components/FilterBar.astro` (style only — the `<script>`
  logic is untouched)
- Test: none new (existing filter tests in `tests/build-output.test.ts`
  already cover markup/behavior and are unaffected by a style-only change)

- [ ] **Step 1: Replace the `<style>` block**

```css
  .filter-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .filter-group {
    display: flex;
    gap: 0.4rem;
  }

  .filter-btn {
    border: 1px solid var(--rule);
    background: var(--bg-surface);
    color: var(--ink);
    font-family: var(--font-body);
    border-radius: 999px;
    padding: 0.3rem 0.75rem;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .filter-btn.active {
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 600;
  }

  .filter-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
```

- [ ] **Step 2: Verify**

Run: `npm run build && npx vitest run`
Expected: all existing tests still pass (no markup/logic changed).

- [ ] **Step 3: Commit**

```bash
git add src/components/FilterBar.astro
git commit -m "style: restyle FilterBar onto the shared design tokens"
```

### Task 6: stats.astro and methodology.astro restyle

**Files:**
- Modify: `src/pages/stats.astro`, `src/pages/methodology.astro` (style only)
- Test: none new (`tests/stats-page.test.ts` / `tests/methodology-page.test.ts`
  already assert on content/structure, unaffected by a style-only change)

**(review fix)** the original draft of this task described the rename via
prose ("...etc. rules...", "apply the same rename... same treatment as
stats.astro") instead of showing the real code for both files. Both full
`<style>` blocks are given below.

- [ ] **Step 1: Replace `src/pages/stats.astro`'s `<style>` block**

```css
  .totals-grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 1rem;
  }

  .totals-card {
    border: 1px solid var(--rule);
    border-radius: 8px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    background: var(--bg-surface);
    font-family: var(--font-body);
  }

  .totals-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--accent);
  }

  .totals-label {
    font-size: 0.8rem;
    color: var(--ink-soft);
  }

  /* Unchanged — a semantic warning color, not part of the skin token
     system. Left hardcoded deliberately, not a missed rename. */
  .anomaly-note {
    margin-top: 1rem;
    font-size: 0.9rem;
    color: #b45309;
  }

  .anomaly-badge {
    display: inline-block;
    margin-left: 0.4rem;
    color: #b45309;
    font-weight: 700;
  }

  .stats-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 0.75rem;
    font-size: 0.9rem;
    background: var(--bg-surface);
    font-family: var(--font-body);
  }

  .stats-table th,
  .stats-table td {
    text-align: left;
    padding: 0.5rem 0.6rem;
    border-bottom: 1px solid var(--rule);
  }

  .stats-table th {
    color: var(--ink-soft);
    font-weight: 600;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .model-cell {
    font-family: var(--font-mono);
    font-size: 0.8rem;
  }
```

- [ ] **Step 2: Replace `src/pages/methodology.astro`'s `<style>` block**

```css
  ul {
    line-height: 1.7;
    font-family: var(--font-body);
  }

  .pricing-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 0.75rem;
    font-size: 0.9rem;
    background: var(--bg-surface);
    font-family: var(--font-body);
  }

  .pricing-table th,
  .pricing-table td {
    text-align: left;
    padding: 0.5rem 0.6rem;
    border-bottom: 1px solid var(--rule);
  }

  .pricing-table th {
    color: var(--ink-soft);
    font-weight: 600;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .model-cell {
    font-family: var(--font-mono);
    font-size: 0.8rem;
  }
```

- [ ] **Step 3: Verify**

Run: `npm run build && npx vitest run`
Expected: all existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/pages/stats.astro src/pages/methodology.astro
git commit -m "style: restyle stats and methodology pages onto the shared design tokens"
```

### Task 7: archive pages restyle

**(review fix)** the original draft applied one combined instruction to
both archive pages, but `archive/[date].astro`'s real `<style>` block only
ever references `var(--accent)` (unchanged) — it has no `.date-count`,
`.feed-list`, `.date-link`, `var(--border)`, or `var(--muted)` at all.
Only `archive/index.astro` needs a token rename; `[date].astro` needs a
much smaller, purely additive change.

**Files:**
- Modify: `src/pages/archive/index.astro`, `src/pages/archive/[date].astro`
- Test: none new (`tests/archive-pages.test.ts` already covers structure)

- [ ] **Step 1: Replace `src/pages/archive/index.astro`'s `<style>` block**

```css
  .date-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .date-card {
    border: 1px solid var(--rule);
    border-radius: 8px;
    padding: 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--bg-surface);
  }

  .date-link {
    font-family: var(--font-display);
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--accent);
    text-decoration: none;
  }

  .date-link:hover {
    text-decoration: underline;
  }

  .date-count {
    font-family: var(--font-body);
    font-size: 0.85rem;
    color: var(--ink-soft);
  }

  .feed-list {
    font-family: var(--font-body);
    line-height: 1.7;
  }
```

- [ ] **Step 2: `src/pages/archive/[date].astro` — additive only, no rename**

Replace only the `<style>` block's contents:

```css
  .date-nav {
    margin-top: 2rem;
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    font-size: 0.9rem;
    font-family: var(--font-body);
  }

  .date-nav a {
    color: var(--accent);
    text-decoration: none;
  }

  .date-nav a:hover {
    text-decoration: underline;
  }
```

(Only the `font-family` line is new; `var(--accent)` was already correct
and unchanged.)

- [ ] **Step 3: Verify**

Run: `npm run build && npx vitest run`
Expected: all existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/pages/archive/index.astro "src/pages/archive/[date].astro"
git commit -m "style: restyle archive pages onto the shared design tokens"
```

### Task 8: Remove legacy token aliases + regression guard

**Files:**
- Modify: `src/layouts/Layout.astro` (remove the legacy alias block added
  in Task 1)
- Create: `tests/legacy-tokens.test.ts`

**Interfaces:**
- Consumes: nothing new. This task's own test is the final proof that
  Tasks 5-7 left no stragglers.

- [ ] **Step 1: Write the test**

`tests/legacy-tokens.test.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_DIR = join(import.meta.dirname, "..", "src");
const LEGACY_PATTERN = /var\(--(bg|fg|muted|border)\)/;

function findAstroFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true })
    .filter((entry) => typeof entry === "string" && entry.endsWith(".astro"))
    .map((entry) => join(dir, entry as string));
}

describe("legacy design tokens", () => {
  it("are not referenced by any .astro source file", () => {
    const offenders = findAstroFiles(SRC_DIR)
      .filter((filePath) => LEGACY_PATTERN.test(readFileSync(filePath, "utf-8")))
      .map((filePath) => filePath.replace(SRC_DIR, "src"));
    expect(
      offenders,
      `expected no .astro file to reference the legacy --bg/--fg/--muted/--border tokens, found: ${JSON.stringify(offenders)}`,
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test — expected to already pass**

Run: `npx vitest run tests/legacy-tokens.test.ts`
Expected: PASS already (Tasks 5-7 already removed every reference) —
this test's value is as a permanent regression guard against
*reintroduction*, not as a currently-failing check.

- [ ] **Step 3: Remove the alias block**

In `src/layouts/Layout.astro`, delete the
`/* Legacy aliases ... */ :root { --bg: ...; --fg: ...; --muted: ...; --border: ...; }`
block added in Task 1.

- [ ] **Step 4: Run the full suite and build**

Run: `npm run build && npx vitest run`
Expected: all tests pass, including `tests/legacy-tokens.test.ts`. If
`npm run build` produces a visually broken page with no hard error (CSS
custom properties don't throw — an undefined one just resolves to
nothing), that means some *non-`.astro`* file still references a legacy
name (this regression test only scans `.astro` files) — search more
broadly with `grep -rn "var(--bg)\|var(--fg)\|var(--muted)\|var(--border)" src/`
before proceeding.

- [ ] **Step 5: Commit**

```bash
git add src/layouts/Layout.astro tests/legacy-tokens.test.ts
git commit -m "chore: remove legacy design token aliases now that every component is migrated"
```

---

## Final Verification (after all 4 phases/PRs have merged)

- `npx tsc --noEmit` clean.
- `npx vitest run` — full suite green.
- `npm run build` — clean build, 5 pages.
- Manual click-through (required — this is a visual redesign): all 3
  supported combinations (Dev-dark, Newspaper-light, Newspaper-dark) on
  `/`, `/archive/`, `/archive/[date]`, `/stats`, `/methodology`; confirm
  the chart recolors live on skin/theme switch.
- Contrast was already verified in Global Constraints before this plan
  was finalized (real computed WCAG ratios, not deferred) — this step is
  a final spot-check that the shipped hex values match what's documented
  there, not the first time contrast is considered.
