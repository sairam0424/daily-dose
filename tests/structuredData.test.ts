// PRECONDITION: e2e-style test reading already-built output — run `npm run
// build` first.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DIST_DIR } from "./testUtils.js";

const DIGEST_BASE = join(import.meta.dirname, "..", "src", "data", "digest");

function committedDates(): string[] {
  return readdirSync(DIGEST_BASE, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function readJsonLdBlocks(html: string): unknown[] {
  const blocks = [
    ...html.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    ),
  ];
  return blocks.map((match) => JSON.parse(match[1]));
}

function readDist(...segments: string[]): string {
  const path = join(DIST_DIR, ...segments);
  if (!existsSync(path)) {
    throw new Error(`${path} not found — run \`npm run build\` first.`);
  }
  return readFileSync(path, "utf-8");
}

describe("structured data: WebSite node", () => {
  it("(regression) ships a valid WebSite node on every page type, with no SearchAction and no invented Organization/Person", () => {
    const pages = [
      readDist("index.html"),
      readDist("archive", "index.html"),
      readDist("methodology", "index.html"),
      readDist("privacy", "index.html"),
    ];
    for (const html of pages) {
      const blocks = readJsonLdBlocks(html);
      const website = blocks.find(
        (b): b is Record<string, unknown> =>
          typeof b === "object" &&
          b !== null &&
          (b as any)["@type"] === "WebSite",
      );
      expect(website, "expected a WebSite JSON-LD block").toBeTruthy();
      expect(website!.name).toBe("The Daily Dose");
      expect(website).not.toHaveProperty("potentialAction");
      expect(website).not.toHaveProperty("publisher");
    }
  });
});

describe("structured data: archive index CollectionPage + BreadcrumbList", () => {
  it("(regression) ships a CollectionPage/ItemList matching the real committed date count", () => {
    const html = readDist("archive", "index.html");
    const blocks = readJsonLdBlocks(html);
    const collection = blocks.find(
      (b): b is Record<string, any> =>
        typeof b === "object" &&
        b !== null &&
        (b as any)["@type"] === "CollectionPage",
    );
    expect(collection, "expected a CollectionPage JSON-LD block").toBeTruthy();
    const itemList = collection!.mainEntity;
    expect(itemList["@type"]).toBe("ItemList");
    expect(itemList.itemListElement.length).toBe(committedDates().length);
    const firstItem = itemList.itemListElement[0];
    expect(firstItem["@type"]).toBe("ListItem");
    expect(typeof firstItem.url).toBe("string");
    expect(firstItem.url).toContain("/archive/");
  });

  it("(regression) ships a 2-level BreadcrumbList whose final entry omits `item`", () => {
    const html = readDist("archive", "index.html");
    const blocks = readJsonLdBlocks(html);
    const breadcrumb = blocks.find(
      (b): b is Record<string, any> =>
        typeof b === "object" &&
        b !== null &&
        (b as any)["@type"] === "BreadcrumbList",
    );
    expect(breadcrumb, "expected a BreadcrumbList JSON-LD block").toBeTruthy();
    expect(breadcrumb!.itemListElement.length).toBe(2);
    const finalEntry = breadcrumb!.itemListElement.at(-1);
    expect(finalEntry).not.toHaveProperty("item");
  });
});

describe("structured data: date-archive page BreadcrumbList", () => {
  it("(regression) ships a 3-level BreadcrumbList whose final entry (the date itself) omits `item`", () => {
    const latestDate = committedDates().at(-1);
    expect(latestDate, "expected at least one committed date").toBeTruthy();
    const html = readDist("archive", latestDate!, "index.html");
    const blocks = readJsonLdBlocks(html);
    const breadcrumb = blocks.find(
      (b): b is Record<string, any> =>
        typeof b === "object" &&
        b !== null &&
        (b as any)["@type"] === "BreadcrumbList",
    );
    expect(breadcrumb, "expected a BreadcrumbList JSON-LD block").toBeTruthy();
    expect(breadcrumb!.itemListElement.length).toBe(3);
    expect(breadcrumb!.itemListElement[0].item).toContain(
      "daily-dose-hazel-delta.vercel.app/",
    );
    expect(breadcrumb!.itemListElement[1].item).toContain("/archive/");
    const finalEntry = breadcrumb!.itemListElement.at(-1);
    expect(finalEntry.name).toBe(latestDate);
    expect(finalEntry).not.toHaveProperty("item");
  });
});
