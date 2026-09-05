import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../src/components/StoryCard.astro", import.meta.url),
  "utf-8",
);

describe("StoryCard.astro source structure", () => {
  it("renders the analysis paragraph conditionally, between the title and the badge row", () => {
    const titleEnd = source.indexOf("</a>");
    const analysisLine = source.indexOf(
      '{entry.data.analysis && <p class="story-analysis">{entry.data.analysis}</p>}',
    );
    const metaStart = source.indexOf('<div class="story-meta">');

    expect(titleEnd).toBeGreaterThan(-1);
    expect(analysisLine).toBeGreaterThan(-1);
    expect(metaStart).toBeGreaterThan(-1);
    expect(analysisLine).toBeGreaterThan(titleEnd);
    expect(analysisLine).toBeLessThan(metaStart);
  });

  it("defines a .story-analysis style rule using the shared body-text tokens", () => {
    expect(source).toMatch(
      /\.story-analysis\s*\{[^}]*font-family:\s*var\(--font-body\)[^}]*color:\s*var\(--ink-soft\)/s,
    );
  });

  it("defines a larger .story-analysis size override for the lead story", () => {
    expect(source).toMatch(/\.lead-story \.story-analysis\s*\{[^}]*font-size:/);
  });
});
