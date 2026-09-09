// PRECONDITION: e2e-style test reading already-built output — run `npm run
// build` first.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { DIST_DIR } from "./testUtils.js";

const DIST_PRIVACY = join(DIST_DIR, "privacy", "index.html");
const DIST_INDEX = join(DIST_DIR, "index.html");

let privacyHtml: string;
let homeHtml: string;

beforeAll(() => {
  if (!existsSync(DIST_PRIVACY)) {
    throw new Error(
      "dist/privacy/index.html not found — run `npm run build` first.",
    );
  }
  if (!existsSync(DIST_INDEX)) {
    throw new Error("dist/index.html not found — run `npm run build` first.");
  }
  privacyHtml = readFileSync(DIST_PRIVACY, "utf-8");
  homeHtml = readFileSync(DIST_INDEX, "utf-8");
});

describe("dist/privacy/index.html", () => {
  it("is a real HTML document", () => {
    expect(privacyHtml.toUpperCase()).toContain("<!DOCTYPE HTML>");
  });

  it("names the real legitimate-interest basis, not generic boilerplate", () => {
    expect(privacyHtml).toContain("legitimate interest");
    expect(privacyHtml).toContain("Art. 6(1)(f)");
  });

  it("accurately states Vercel's real retention window (at least one month, not a fabricated exact date)", () => {
    expect(privacyHtml.toLowerCase()).toContain("at least");
    expect(privacyHtml.toLowerCase()).toContain("one month");
  });

  it("is honest that it sets no cookies of its own", () => {
    expect(privacyHtml).toContain("localStorage");
    expect(privacyHtml.toLowerCase()).toContain("no cookies");
  });

  it("(seo fix) links to the real ICO complaint channel, without linking to the private GitHub repo", () => {
    expect(privacyHtml).not.toContain("github.com/sairam0424/daily-dose");
    expect(privacyHtml).toContain("ico.org.uk");
  });
});

describe("privacy page is proactively linked (audit fix - a privacy page must be easily accessible, not just present)", () => {
  it("the homepage footer links to /privacy", () => {
    expect(homeHtml).toMatch(/<a href="\/privacy"[^>]*>Privacy<\/a>/);
  });
});
