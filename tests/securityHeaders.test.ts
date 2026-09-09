import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface VercelHeaderRule {
  source: string;
  headers: Array<{ key: string; value: string }>;
}

const vercelConfig = JSON.parse(readFileSync("vercel.json", "utf-8")) as {
  headers: VercelHeaderRule[];
};

function findHeader(source: string, key: string): string | undefined {
  const rule = vercelConfig.headers.find((r) => r.source === source);
  return rule?.headers.find((h) => h.key === key)?.value;
}

describe("vercel.json security headers", () => {
  it("(seo fix) sets a real Permissions-Policy locking down unused features", () => {
    const value = findHeader("/(.*)", "Permissions-Policy");
    expect(value).toBeTruthy();
    expect(value).toContain("camera=()");
    expect(value).toContain("microphone=()");
    expect(value).toContain("geolocation=()");
  });

  it("(seo fix) sets a real Content-Security-Policy with the strict directives this site's real resource shape supports", () => {
    const value = findHeader("/(.*)", "Content-Security-Policy");
    expect(value).toBeTruthy();
    expect(value).toContain("default-src 'self'");
    expect(value).toContain("object-src 'none'");
    expect(value).toContain("base-uri 'self'");
    expect(value).toContain("form-action 'none'");
    expect(value).toContain("frame-ancestors 'none'");
    // img-src must allow arbitrary https hosts - story thumbnails/favicons
    // are hotlinked from third-party sites by design (see imageResolution.ts).
    expect(value).toContain("img-src 'self' https:");
  });

  it("(regression) keeps the 3 existing, already-live security headers unchanged", () => {
    expect(findHeader("/(.*)", "X-Content-Type-Options")).toBe("nosniff");
    expect(findHeader("/(.*)", "X-Frame-Options")).toBe("DENY");
    expect(findHeader("/(.*)", "Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
  });
});
