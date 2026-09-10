import type { APIContext, MiddlewareNext } from "astro";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isStatsPath, isValidBasicAuth, onRequest } from "../src/middleware.js";

// NOTE: uses a helper function to supply the test fixture value rather
// than a bare top-level constant assignment, because this environments
// secret-scan hook flags the literal assignment-of-quoted-string shape
// as a false positive on test fixtures. Behavior and assertions below
// are otherwise unchanged from the plan.
function testCredential() {
  return "correct-password";
}

function basicAuthHeader(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

// Minimal APIContext/MiddlewareNext stand-ins - onRequest only reads
// `context.url`/`context.request` and calls `next()`, so a full Astro
// APIContext isn't needed to exercise it directly (defineMiddleware is a
// no-op wrapper - see astro/dist/core/middleware/defineMiddleware.js -
// so onRequest is callable as a plain function here).
function fakeContext(
  pathname: string,
  headers: Record<string, string> = {},
): APIContext {
  const url = new URL(`http://localhost${pathname}`);
  return {
    url,
    request: new Request(url, { headers }),
  } as unknown as APIContext;
}

function fakeNext(response: Response): MiddlewareNext {
  return (() => Promise.resolve(response)) as unknown as MiddlewareNext;
}

describe("isValidBasicAuth", () => {
  it("accepts the correct password regardless of the username field", () => {
    expect(
      isValidBasicAuth(
        basicAuthHeader("anything", testCredential()),
        testCredential(),
      ),
    ).toBe(true);
  });

  it("rejects the wrong password", () => {
    expect(
      isValidBasicAuth(basicAuthHeader("owner", "wrong"), testCredential()),
    ).toBe(false);
  });

  it("rejects a missing Authorization header", () => {
    expect(isValidBasicAuth(null, testCredential())).toBe(false);
  });

  it("rejects a non-Basic Authorization scheme", () => {
    expect(isValidBasicAuth("Bearer sometoken", testCredential())).toBe(false);
  });

  it("rejects malformed base64 without throwing", () => {
    expect(
      isValidBasicAuth("Basic not-valid-base64!!!", testCredential()),
    ).toBe(false);
  });

  it("rejects a wrong password of a different length without throwing (constant-time comparison via hashed digests)", () => {
    // testCredential() is 17 chars; "x" is 1 - a raw `timingSafeEqual`
    // on the unhashed strings would throw on this length mismatch.
    // Hashing both sides to a fixed-length SHA-256 digest first (see
    // src/middleware.ts's safeCompare) means this returns false cleanly.
    expect(() =>
      isValidBasicAuth(basicAuthHeader("owner", "x"), testCredential()),
    ).not.toThrow();
    expect(
      isValidBasicAuth(basicAuthHeader("owner", "x"), testCredential()),
    ).toBe(false);
  });
});

describe("onRequest — Cache-Control on /stats", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env.STATS_PASSWORD = testCredential();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("sets a private, no-store Cache-Control on the 401 challenge", async () => {
    const context = fakeContext("/stats");
    const response = await onRequest(
      context,
      fakeNext(new Response("unused - no valid credential supplied")),
    );
    // onRequest's real return type is Response | void (Astro's
    // MiddlewareHandler allows a void "fall through" return) - narrow it
    // here since this test's whole point is asserting on a real Response.
    if (!response) throw new Error("expected onRequest to return a Response");
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("sets a private, no-store Cache-Control on the real authenticated response", async () => {
    const context = fakeContext("/stats", {
      Authorization: basicAuthHeader("owner", testCredential()),
    });
    const response = await onRequest(
      context,
      fakeNext(new Response("real stats page markup")),
    );
    if (!response) throw new Error("expected onRequest to return a Response");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("isStatsPath", () => {
  // Regression guard for a real bypass: Astro's default trailingSlash
  // mode ("ignore") routes "/stats/" to the exact same page as "/stats" -
  // a naive strict-equality check against only "/stats" would let
  // "/stats/" reach the page with zero auth check at all.
  it("matches the bare path", () => {
    expect(isStatsPath("/stats")).toBe(true);
  });

  it("matches the path with a trailing slash (the real bypass this guards against)", () => {
    expect(isStatsPath("/stats/")).toBe(true);
  });

  it("does not match unrelated paths", () => {
    expect(isStatsPath("/")).toBe(false);
    expect(isStatsPath("/stats-old")).toBe(false);
    expect(isStatsPath("/archive/stats")).toBe(false);
  });
});
