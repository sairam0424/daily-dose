import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_DIR = join(import.meta.dirname, "..", "src");
const LEGACY_PATTERN = /var\(--(bg|fg|muted|border)\)/;

function findAstroFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true })
    .filter((entry) => typeof entry === "string" && entry.endsWith(".astro"))
    .map((entry) => join(dir, entry as string));
}

describe("legacy design tokens", () => {
  it("are not referenced by any .astro source file", () => {
    const offenders = findAstroFiles(SRC_DIR)
      .filter((filePath) =>
        LEGACY_PATTERN.test(readFileSync(filePath, "utf-8")),
      )
      .map((filePath) => filePath.replace(SRC_DIR, "src"));
    expect(
      offenders,
      `expected no .astro file to reference the legacy --bg/--fg/--muted/--border tokens, found: ${JSON.stringify(offenders)}`,
    ).toEqual([]);
  });
});
