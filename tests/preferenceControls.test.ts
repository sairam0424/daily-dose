import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";

const source = readFileSync(
  new URL("../src/components/PreferenceControls.astro", import.meta.url),
  "utf-8",
);

/** Extracts the real <script> body from this component and runs it
 * against a real jsdom document with a real click - a source-text regex
 * match alone (see the tests below) proves syncControls() itself is
 * correct, but NOT that every click handler actually calls it; this is
 * exactly the gap that let a real regression (the theme-toggle button's
 * aria-pressed never updating after a click) ship undetected until a
 * live browser test caught it. TS-only syntax (`as HTMLButtonElement |
 * null`) is stripped since this runs as plain JS in jsdom, not through
 * Astro/TS compilation. */
function runScriptAgainstDom(html: string): {
  document: Document;
  window: InstanceType<typeof JSDOM>["window"];
} {
  const scriptMatch = source.match(/<script>([\s\S]*?)<\/script>/);
  if (!scriptMatch) throw new Error("expected a <script> block");
  const plainJs = scriptMatch[1]
    .replace(/ as HTMLButtonElement \| null/g, "")
    .replace(/\(\): string \{/g, "() {")
    .replace(/\(skin: 'dev' \| 'newspaper'\)/g, "(skin)");

  // A real http(s) `url` is required for jsdom's localStorage to actually
  // work (it throws under the default about:blank/file: origin) - this
  // script calls localStorage.setItem() before its own re-sync call, so
  // without a real origin the click handler throws mid-way and silently
  // never reaches the fix being tested here, producing a false negative.
  const dom = new JSDOM(html, {
    runScripts: "outside-only",
    url: "https://daily-dose-hazel-delta.vercel.app/",
  });
  dom.window.eval(plainJs);
  return { document: dom.window.document, window: dom.window };
}

// data-skin="newspaper" matches the real production default (Layout.astro's
// head bootstrap script sets this before this component's own script ever
// runs) - without it, currentSkin() falls through to its own 'dev' default
// and the theme button's real early-return guard (`if (currentSkin() ===
// 'dev') return;`) would make every test here a false negative.
const PREFERENCE_CONTROLS_HTML = `
  <html data-skin="newspaper"><body>
  <div class="preference-controls">
    <button id="theme-toggle" type="button" aria-label="Toggle dark mode" aria-pressed="false"></button>
    <div class="skin-toggle">
      <button id="skin-toggle-dev" type="button" aria-pressed="false">Dev</button>
      <button id="skin-toggle-newspaper" type="button" aria-pressed="true">Newspaper</button>
    </div>
  </div>
  </body></html>
`;

describe("PreferenceControls.astro source structure", () => {
  it("(a11y fix) gives #theme-toggle a static default aria-pressed, matching the skin-toggle buttons' own hardcoded default", () => {
    // #skin-toggle-dev/#skin-toggle-newspaper both ship a hardcoded default
    // aria-pressed matching the default-rendered skin (newspaper) - this
    // asserts #theme-toggle gets the same treatment instead of omitting
    // the attribute from the server-rendered markup entirely.
    expect(source).toMatch(
      /<button\s+id="theme-toggle"[^>]*aria-pressed="false"[^>]*>/s,
    );
  });

  it("(a11y fix) sets #theme-toggle's aria-pressed from real dark-mode state inside syncControls(), mirroring the skin-toggle buttons' own dynamic aria-pressed calls", () => {
    const syncControlsBody = source.match(
      /function syncControls\(\) \{([\s\S]*?)\n  \}/,
    );
    expect(syncControlsBody, "expected a syncControls() function").toBeTruthy();

    const body = syncControlsBody![1];

    // The two existing sibling buttons already set aria-pressed dynamically
    // here - confirm that pattern is untouched.
    expect(body).toContain(
      "devButton?.setAttribute('aria-pressed', String(isDev));",
    );
    expect(body).toContain(
      "newspaperButton?.setAttribute('aria-pressed', String(!isDev));",
    );

    // #theme-toggle must now do the same, driven by real dark-mode state
    // (not `isDev`, since theme and skin are independent axes once out of
    // Dev-editorial mode).
    expect(body).toMatch(
      /themeButton\.setAttribute\('aria-pressed', String\(isDark\)\);/,
    );
    expect(body).toMatch(
      /const isDark = document\.documentElement\.dataset\.theme === 'dark';/,
    );
  });
});

describe("PreferenceControls.astro real click behavior (regression - a real DOM interaction, not a source-text match)", () => {
  it("(regression) updates #theme-toggle's aria-pressed to true after a real click, not just the visual theme", () => {
    const { document } = runScriptAgainstDom(PREFERENCE_CONTROLS_HTML);
    const themeButton = document.getElementById("theme-toggle")!;

    expect(themeButton.getAttribute("aria-pressed")).toBe("false");
    themeButton.click();

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(themeButton.getAttribute("aria-pressed")).toBe("true");
  });

  it("(regression) flips #theme-toggle's aria-pressed back to false on a second real click", () => {
    const { document } = runScriptAgainstDom(PREFERENCE_CONTROLS_HTML);
    const themeButton = document.getElementById("theme-toggle")!;

    themeButton.click();
    themeButton.click();

    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(themeButton.getAttribute("aria-pressed")).toBe("false");
  });
});
