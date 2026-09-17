import { describe, expect, it } from "vitest";
import { decodeHtmlEntities } from "./testUtils.js";

describe("decodeHtmlEntities", () => {
  // (regression) real bug: build-output.test.ts and archive-preview-cards.test.ts
  // both compared a raw digest-item title string directly against rendered
  // HTML - passed for every title ever committed until a real HN story
  // title finally contained an apostrophe, which Astro's default text-node
  // rendering HTML-entity-escapes as &#39;, causing a false-negative
  // string-equality failure unrelated to any real rendering bug.
  it("decodes an apostrophe rendered as &#39; back to a literal '", () => {
    expect(
      decodeHtmlEntities(
        "Keys Not Included: recovering the signing keys for US driver&#39;s license barcodes",
      ),
    ).toBe(
      "Keys Not Included: recovering the signing keys for US driver's license barcodes",
    );
  });

  it("decodes &amp;/&lt;/&gt;/&quot; in one pass, without double-decoding", () => {
    expect(decodeHtmlEntities("React &amp; Redux")).toBe("React & Redux");
    expect(decodeHtmlEntities("&lt;script&gt;")).toBe("<script>");
    expect(decodeHtmlEntities("&quot;quoted&quot;")).toBe('"quoted"');
  });

  it("leaves text with no entities unchanged", () => {
    expect(decodeHtmlEntities("plain text, no entities")).toBe(
      "plain text, no entities",
    );
  });
});
