import { describe, expect, it } from "vitest";
import { MAX_LEAD_TITLE_CHARS, quoteLeadTitle } from "../src/lib/leadTitle.js";

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
});
