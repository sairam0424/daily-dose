/**
 * src/lib/featureFlags.ts
 *
 * Vite/Astro coerces an env value that looks boolean-ish (e.g. the literal
 * string "true") into a real boolean for import.meta.env - confirmed
 * directly against a real dev server: ENABLE_DEV_MODE=true resolves to the
 * actual boolean `true`, not the string "true". A naive `value === 'true'`
 * string comparison silently never matches that real shape, so this
 * coerces to a string first regardless of which form it actually arrives
 * as.
 */
export function isFlagEnabled(value: unknown): boolean {
  return String(value) === "true";
}
