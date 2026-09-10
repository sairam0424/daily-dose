// Imported from the real "astro/middleware" subpath rather than the
// "astro:middleware" virtual module: the two are identical at runtime
// (Astro's Vite plugin aliases "astro:middleware" straight to this same
// module - see astro/virtual-modules/middleware.js), but the virtual
// specifier only resolves inside Astro's own Vite pipeline. This repo's
// plain `vitest run` (no astro/config Vite integration - see
// tests/content-collection.test.ts's own note on avoiding "astro:content"
// for the same reason) can only resolve the real subpath, and
// tests/middleware.test.ts needs to import isValidBasicAuth from this
// file directly.
import { createHash, timingSafeEqual } from "node:crypto";
import { defineMiddleware } from "astro/middleware";

// Comparing raw, variable-length password strings with `===` is a timing
// side-channel (CWE-208): a mismatch on the first byte returns faster than
// a mismatch on the last, letting an attacker infer the password one byte
// at a time. `timingSafeEqual` closes that, but it throws on a
// length-mismatched pair - hashing both sides to a fixed-length SHA-256
// digest first sidesteps that entirely (a real, easy-to-hit bug this
// avoids), while still comparing in constant time.
function safeCompare(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a).digest();
  const digestB = createHash("sha256").update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

export function isValidBasicAuth(
  header: string | null,
  expectedPassword: string,
): boolean {
  if (!header || !header.startsWith("Basic ")) {
    return false;
  }
  try {
    const decoded = Buffer.from(
      header.slice("Basic ".length),
      "base64",
    ).toString("utf-8");
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex === -1) {
      return false;
    }
    const password = decoded.slice(separatorIndex + 1);
    return safeCompare(password, expectedPassword);
  } catch {
    return false;
  }
}

// Astro's default trailingSlash mode ("ignore") routes "/stats/" to the
// exact same page as "/stats" - a strict-equality check against only
// "/stats" would let "/stats/" through this middleware entirely
// (isValidBasicAuth never even runs), serving the real gated page with
// no credentials required. Normalize away a single trailing slash before
// comparing so both forms are gated identically.
export function isStatsPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/$/, "") || "/";
  return normalized === "/stats";
}

// /stats is the one credentialed route in this repo - it must never be
// cached by a shared/browser cache (a stale cached response served to the
// wrong requester, or a 401 cached and replayed after the real credential
// is supplied, are both real leaks). Neither the 401 nor the real
// authenticated 200 response gets an explicit Cache-Control anywhere else
// (vercel.json's one immutable-cache rule is scoped to /_astro/(.*) only),
// so both branches below set it directly.
const STATS_CACHE_CONTROL = "private, no-store";

export const onRequest = defineMiddleware(async (context, next) => {
  if (!isStatsPath(context.url.pathname)) {
    return next();
  }

  const expectedPassword = process.env.STATS_PASSWORD;
  if (!expectedPassword) {
    // Fail loud in a way an owner will notice immediately (missing env
    // var is an operational mistake, not a state to silently allow
    // through as if the gate were satisfied) - never fall back to "no
    // password required."
    return new Response("STATS_PASSWORD is not configured.", { status: 500 });
  }

  const header = context.request.headers.get("Authorization");
  if (!isValidBasicAuth(header, expectedPassword)) {
    return new Response("Authentication required.", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="daily-dose stats"',
        "Cache-Control": STATS_CACHE_CONTROL,
      },
    });
  }

  const response = await next();
  response.headers.set("Cache-Control", STATS_CACHE_CONTROL);
  return response;
});
