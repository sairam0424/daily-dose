// PRECONDITION: e2e-style test reading already-built output — run `npm run
// build` first.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { DIST_DIR } from "./testUtils.js";

const DIST_INDEX = join(DIST_DIR, "index.html");
const DIGEST_BASE = join(import.meta.dirname, "..", "src", "data", "digest");

function latestDigestItemCount(): number {
  const dates = readdirSync(DIGEST_BASE, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const latestDate = dates.at(-1);
  if (!latestDate) return 0;
  return readdirSync(join(DIGEST_BASE, latestDate)).filter((file) =>
    file.endsWith(".json"),
  ).length;
}

let html: string;

beforeAll(() => {
  if (!existsSync(DIST_INDEX)) {
    throw new Error("dist/index.html not found — run `npm run build` first.");
  }
  html = readFileSync(DIST_INDEX, "utf-8");
});

describe("homepage ItemList JSON-LD", () => {
  it("(regression) ships a valid application/ld+json ItemList matching the real digest item count", () => {
    const match = html.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
    );
    expect(
      match,
      'expected a <script type="application/ld+json"> block',
    ).toBeTruthy();

    const schema = JSON.parse(match![1]);
    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@type"]).toBe("ItemList");
    expect(Array.isArray(schema.itemListElement)).toBe(true);
    expect(schema.itemListElement.length).toBe(latestDigestItemCount());

    const firstItem = schema.itemListElement[0];
    expect(firstItem["@type"]).toBe("ListItem");
    expect(firstItem.position).toBe(1);
    expect(typeof firstItem.url).toBe("string");
    expect(typeof firstItem.name).toBe("string");
  });
});
