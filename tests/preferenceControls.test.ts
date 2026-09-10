import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../src/components/PreferenceControls.astro", import.meta.url),
  "utf-8",
);

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
