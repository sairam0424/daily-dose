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
import { defineMiddleware } from "astro/middleware";

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
    return password === expectedPassword;
  } catch {
    return false;
  }
}

export const onRequest = defineMiddleware((context, next) => {
  if (context.url.pathname !== "/stats") {
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
      headers: { "WWW-Authenticate": 'Basic realm="daily-dose stats"' },
    });
  }

  return next();
});
