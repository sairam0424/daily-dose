import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { DigestItemSchema } from "../src/lib/digestSchema.js";
import { DIST_DIR } from "./testUtils.js";

const DIST_ARCHIVE_INDEX = join(DIST_DIR, "archive", "index.html");
const DIGEST_BASE = join(import.meta.dirname, "..", "src", "data", "digest");

function readLeadStoryForLatestDate() {
  const latestDate = readdirSync(DIGEST_BASE)
    .filter((entry) => existsSync(join(DIGEST_BASE, entry)))
    .sort()
    .at(-1) as string;
  const files = readdirSync(join(DIGEST_BASE, latestDate)).filter((f) =>
    f.endsWith(".json"),
  );
  const items = files.map((f) =>
    DigestItemSchema.parse(
      JSON.parse(readFileSync(join(DIGEST_BASE, latestDate, f), "utf-8")),
    ),
  );
  items.sort((a, b) => b.interest_score - a.interest_score);
  return { date: latestDate, lead: items[0] };
}

let html: string;

beforeAll(() => {
  if (!existsSync(DIST_ARCHIVE_INDEX)) {
    throw new Error(
      "dist/archive/index.html not found - run `npm run build` first.",
    );
  }
  html = readFileSync(DIST_ARCHIVE_INDEX, "utf-8");
});

describe("archive preview cards", () => {
  it("(backlog) shows the lead story's real title and why_read excerpt for each date, not a bare link", () => {
    const { lead } = readLeadStoryForLatestDate();
    expect(html).toContain(lead.title);
    expect(html).toContain(lead.why_read.slice(0, 40));
  });

  it("(backlog) still shows the real item count per date", () => {
    expect(html).toMatch(/\d+\s*items?/);
  });
});
