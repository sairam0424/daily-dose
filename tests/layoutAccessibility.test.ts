// Static-source tests for the two Layout.astro accessibility audit fixes
// (--ink-faint contrast + skip-to-main-content link). Reads src/layouts/
// Layout.astro's raw source directly rather than a built dist/ page -
// both fixes are entirely self-contained within this one file, so there's
// no need for the heavier build-then-read convention some other tests use
// (see tests/testUtils.ts) just to exercise plain CSS custom-property
// values and static markup that Astro passes through unchanged.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const LAYOUT_PATH = "src/layouts/Layout.astro";
const source = readFileSync(LAYOUT_PATH, "utf-8");

const HEX_RE = /#[0-9a-fA-F]{6}/;

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

// WCAG 2.x relative luminance + contrast ratio formulas
// (https://www.w3.org/WAI/GL/wiki/Relative_luminance).
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const [R, G, B] = [r, g, b].map((channel8) => {
    const c = channel8 / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrastRatio(hexA: string, hexB: string): number {
  const luminanceA = relativeLuminance(hexToRgb(hexA));
  const luminanceB = relativeLuminance(hexToRgb(hexB));
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

function extractBlock(label: string, selectorPattern: RegExp): string {
  const match = source.match(selectorPattern);
  expect(
    match,
    `expected to find a ${label} rule block in ${LAYOUT_PATH}`,
  ).toBeTruthy();
  return match![0];
}

function extractVar(label: string, block: string, varName: string): string {
  const match = block.match(new RegExp(`--${varName}:\\s*(${HEX_RE.source})`));
  expect(
    match,
    `expected a --${varName} hex value inside the ${label} block`,
  ).toBeTruthy();
  return match![1];
}

// WCAG AA minimum for normal (non-large) text - all 3 real --ink-faint
// usages (.masthead-utility, .site-footer-links, .site-footer-copyright)
// are small uppercase eyebrow text, so the relaxed 3:1 large-text bar
// does not apply here.
const WCAG_AA_NORMAL_TEXT_MINIMUM = 4.5;

describe("--ink-faint clears WCAG AA contrast (accessibility audit fix, item 6b)", () => {
  it("Newspaper light: --ink-faint against --bg-surface", () => {
    const block = extractBlock(
      "Newspaper light",
      /:root,\s*\[data-skin='newspaper'\]\s*\{[^}]*\}/,
    );
    const bg = extractVar("Newspaper light", block, "bg-surface");
    const fg = extractVar("Newspaper light", block, "ink-faint");
    expect(contrastRatio(bg, fg)).toBeGreaterThanOrEqual(
      WCAG_AA_NORMAL_TEXT_MINIMUM,
    );
  });

  it("Newspaper dark: --ink-faint against --bg-surface", () => {
    const block = extractBlock(
      "Newspaper dark",
      /\[data-skin='newspaper'\]\[data-theme='dark'\]\s*\{[^}]*\}/,
    );
    const bg = extractVar("Newspaper dark", block, "bg-surface");
    const fg = extractVar("Newspaper dark", block, "ink-faint");
    expect(contrastRatio(bg, fg)).toBeGreaterThanOrEqual(
      WCAG_AA_NORMAL_TEXT_MINIMUM,
    );
  });

  it("dev skin: --ink-faint against --bg-page (its real usages sit directly on the page background)", () => {
    const block = extractBlock("dev skin", /\[data-skin='dev'\]\s*\{[^}]*\}/);
    const bg = extractVar("dev skin", block, "bg-page");
    const fg = extractVar("dev skin", block, "ink-faint");
    expect(contrastRatio(bg, fg)).toBeGreaterThanOrEqual(
      WCAG_AA_NORMAL_TEXT_MINIMUM,
    );
  });
});

describe("skip-to-main-content link (accessibility audit fix, item 6c)", () => {
  it("renders as the first element inside <body>, ahead of Analytics/SpeedInsights/ScrollToTop", () => {
    const bodyMatch = source.match(/<body>([\s\S]*?)<Analytics/);
    expect(
      bodyMatch,
      "expected to find <body> ... <Analytics in Layout.astro",
    ).toBeTruthy();
    const beforeAnalytics = bodyMatch![1];
    expect(beforeAnalytics).toMatch(
      /<a\s+href="#main-content"\s+class="skip-link">[^<]*<\/a>/,
    );
  });

  it("targets #main-content, matching the id the runtime script assigns to <main>", () => {
    expect(source).toMatch(/<a href="#main-content" class="skip-link">/);
    expect(source).toMatch(/main\.id\s*=\s*"main-content"/);
  });

  it("gives <main> a programmatic focus target (tabindex) so the fragment jump is actually focusable", () => {
    expect(source).toMatch(/main\.setAttribute\("tabindex",\s*"-1"\)/);
  });

  it("is visually hidden off-screen by default and returns to top:0 on focus", () => {
    const skipLinkBlock = source.match(/\.skip-link\s*\{([^}]*)\}/);
    expect(skipLinkBlock, "expected a .skip-link{} rule").toBeTruthy();
    expect(skipLinkBlock![1]).toMatch(/position:\s*absolute/);
    expect(skipLinkBlock![1]).toMatch(/top:\s*-\d/);

    const focusBlock = source.match(/\.skip-link:focus-visible\s*\{([^}]*)\}/);
    expect(
      focusBlock,
      "expected a .skip-link:focus-visible{} rule",
    ).toBeTruthy();
    expect(focusBlock![1]).toMatch(/top:\s*0/);
  });
});
