import { describe, expect, it } from "vitest";
import {
  buildArchiveDateTitle,
  MAX_LEAD_TITLE_CHARS,
  quoteLeadTitle,
} from "../src/lib/leadTitle.js";

describe("quoteLeadTitle", () => {
  it("quotes a short title with a trailing period", () => {
    expect(quoteLeadTitle("Hello world")).toBe('"Hello world."');
  });

  it("strips existing terminal punctuation before re-adding the period, avoiding double punctuation", () => {
    expect(quoteLeadTitle("Is this the future?")).toBe('"Is this the future."');
    expect(quoteLeadTitle("Amazing!")).toBe('"Amazing."');
  });

  it("truncates a title longer than MAX_LEAD_TITLE_CHARS with an ellipsis instead of a period", () => {
    const longTitle = "a".repeat(MAX_LEAD_TITLE_CHARS + 10);
    expect(quoteLeadTitle(longTitle)).toBe(
      `"${"a".repeat(MAX_LEAD_TITLE_CHARS)}…"`,
    );
  });

  it("(regression) truncates a title with an astral-plane emoji positioned exactly at the truncation boundary without producing a lone surrogate", () => {
    // U+1F680 (🚀) is outside the Basic Multilingual Plane, so JavaScript
    // encodes it as a two-code-unit UTF-16 surrogate pair. Padding with
    // exactly MAX_LEAD_TITLE_CHARS - 1 filler characters puts the emoji's
    // surrogate pair straddling the old, buggy `.slice(0,
    // MAX_LEAD_TITLE_CHARS)` UTF-16 code-unit boundary: the old code would
    // keep the high surrogate (code unit 47) and drop the low surrogate
    // (code unit 48), leaving a lone/unpaired surrogate right before the
    // added ellipsis.
    const emoji = "\u{1F680}";
    const padding = "x".repeat(MAX_LEAD_TITLE_CHARS - 1);
    const title = `${padding}${emoji} rest of a real title that runs on past the cutoff point`;

    const result = quoteLeadTitle(title);

    // A lone surrogate makes encodeURIComponent throw a URIError - it
    // must not throw on a correctly code-point-safe truncation.
    expect(() => encodeURIComponent(result)).not.toThrow();

    // A lone surrogate serialized to UTF-8 and decoded back becomes the
    // U+FFFD replacement character - round-tripping through
    // JSON.stringify/JSON.parse (which never touches UTF-8 directly, but
    // still exposes an unpaired surrogate as-is) plus a real UTF-8
    // encode/decode confirms no replacement character was introduced.
    const roundTripped = JSON.parse(JSON.stringify(result));
    expect(roundTripped).not.toContain("�");
    const utf8RoundTripped = new TextDecoder().decode(
      new TextEncoder().encode(roundTripped),
    );
    expect(utf8RoundTripped).not.toContain("�");

    // No lone high surrogate (not immediately followed by its low
    // surrogate) and no lone low surrogate (not immediately preceded by
    // its high surrogate) anywhere in the result.
    expect(result).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    expect(result).not.toMatch(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);

    // The emoji itself survived intact in the truncated, quoted result.
    expect(result).toContain(emoji);
  });

  it("respects a custom, tighter maxChars budget for narrower contexts like a <title> tag", () => {
    const title =
      "A real, unbounded lead story title that is much longer than a tight budget allows";
    expect(quoteLeadTitle(title, 10)).toBe('"A real, un…"');
  });
});

describe("buildArchiveDateTitle", () => {
  const MAX_SAFE_TITLE_LENGTH = 60;

  it("builds the expected 'The Daily Dose — {date} — led by {quoted title}' shape for a short title", () => {
    // Short enough (10 chars) to fit the real remaining per-title budget
    // (60 - the fixed prefix's 37 chars - quoteLeadTitle's own 3 wrapping
    // chars = 20) without truncation.
    expect(buildArchiveDateTitle("2026-09-09", "iPhone Duo")).toBe(
      'The Daily Dose — 2026-09-09 — led by "iPhone Duo."',
    );
  });

  it("(regression) stays at or under the real ~60-char SERP-truncation ceiling for a real, long lead title", () => {
    // A real committed lead title from this session (2026-09-06's top
    // arXiv paper) - 104 characters, more than double
    // MAX_LEAD_TITLE_CHARS, and easily long enough to blow past 60 chars
    // once the fixed "The Daily Dose — {date} — led by " prefix is
    // added if leadTitleQuoted's own 48-char body budget were reused
    // verbatim in the <title> tag instead of a tag-specific budget.
    const realLongLeadTitle =
      "Legibility is Not Interpretability: Comparing Judged and Actual Importance in Chain-Of-Thought Reasoning";
    const title = buildArchiveDateTitle("2026-09-06", realLongLeadTitle);
    expect(title.length).toBeLessThanOrEqual(MAX_SAFE_TITLE_LENGTH);
    expect(title.startsWith("The Daily Dose — 2026-09-06 — led by ")).toBe(
      true,
    );
  });

  it("honors a custom maxChars budget", () => {
    const title = buildArchiveDateTitle(
      "2026-09-09",
      "openai/NavierStokesAndEuler",
      40,
    );
    expect(title.length).toBeLessThanOrEqual(40);
  });
});
