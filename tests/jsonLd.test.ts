import { describe, expect, it } from "vitest";
import { safeJsonLdString } from "../src/lib/jsonLd.js";

describe("safeJsonLdString", () => {
  it("serializes a plain object the same as JSON.stringify when there is no '<'", () => {
    const schema = { "@type": "WebSite", name: "The Daily Dose" };
    expect(safeJsonLdString(schema)).toBe(JSON.stringify(schema));
  });

  it("(security fix) escapes '<' so an untrusted string can never produce a real '</script>' breakout", () => {
    const schema = { name: "XSSPOC</script><script>window.__pwned=1</script>" };
    const serialized = safeJsonLdString(schema);
    expect(serialized).not.toContain("</script");
    expect(serialized).not.toContain("<script");
    // Still valid, round-trippable JSON with the exact original string.
    expect(JSON.parse(serialized).name).toBe(
      "XSSPOC</script><script>window.__pwned=1</script>",
    );
  });
});
