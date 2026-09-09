import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const LLMS_TXT_PATH = join(process.cwd(), "public", "llms.txt");

describe("public/llms.txt", () => {
  it("exists", () => {
    expect(existsSync(LLMS_TXT_PATH)).toBe(true);
  });

  it("names the real sources this site actually aggregates", () => {
    const content = readFileSync(LLMS_TXT_PATH, "utf-8");
    expect(content).toContain("Hacker News");
    expect(content).toContain("arXiv");
    expect(content).toContain("GitHub");
    expect(content).toContain("Dev.to");
  });

  it("(regression) never links to /methodology - that page is deliberately excluded from every discovery path", () => {
    const content = readFileSync(LLMS_TXT_PATH, "utf-8");
    expect(content).not.toContain("/methodology");
  });

  it("links to the real archive and RSS feed", () => {
    const content = readFileSync(LLMS_TXT_PATH, "utf-8");
    expect(content).toContain(
      "https://daily-dose-hazel-delta.vercel.app/archive/",
    );
    expect(content).toContain(
      "https://daily-dose-hazel-delta.vercel.app/rss.xml",
    );
  });
});
