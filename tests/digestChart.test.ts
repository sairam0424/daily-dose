import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIGEST_CHART_SOURCE = join(
  import.meta.dirname,
  "..",
  "src",
  "components",
  "DigestChart.astro",
);

describe("DigestChart.astro chart config (audit fix)", () => {
  const source = readFileSync(DIGEST_CHART_SOURCE, "utf-8");

  it("truncates x-axis labels via getLabelForValue, not the raw tick value", () => {
    expect(source).toMatch(/this\.getLabelForValue\(value\)/);
  });

  it("caps maxRotation so label rotation can't consume unbounded height", () => {
    expect(source).toMatch(/maxRotation:\s*45/);
  });

  it("disables maintainAspectRatio so the plot area doesn't collapse on narrow containers", () => {
    expect(source).toMatch(/maintainAspectRatio:\s*false/);
  });

  it("gives the canvas an explicit CSS height so maintainAspectRatio:false has something to fill", () => {
    expect(source).toMatch(/#score-chart\s*\{[^}]*height:\s*320px/);
  });
});
