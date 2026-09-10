/**
 * scripts/a11yCheckWorker.ts
 *
 * One page, one process. axe-core (node_modules/axe-core/axe.js) binds to
 * whichever `window`/`document` are global at the moment it's first
 * imported - see its closing `})(typeof window === 'object' ? window :
 * this);`. Running every representative page in a single long-lived
 * process would mean every page after the first silently reuses the FIRST
 * page's document. a11yCheck.ts spawns this file as a fresh child process
 * per page instead, so each page's `import("axe-core")` sees exactly one,
 * correctly-bound `window`/`document` for its own HTML.
 *
 * Never run this directly except via a11yCheck.ts.
 *
 * Usage: node --import tsx scripts/a11yCheckWorker.ts <path-to-built-html>
 */
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const htmlPath = process.argv[2];
if (!htmlPath) {
  throw new Error("usage: a11yCheckWorker.ts <path-to-built-html>");
}

const html = readFileSync(htmlPath, "utf-8");
const dom = new JSDOM(html, {
  url: "https://daily-dose-hazel-delta.vercel.app/",
});

// Must be set before axe-core is imported below - its own module-load-time
// IIFE reads the global `window` exactly once.
globalThis.window = dom.window as unknown as typeof globalThis.window;
globalThis.document = dom.window.document as unknown as Document;

const axe = (await import("axe-core")).default;

// axe-core's own README: "There is limited support for JSDOM ... Currently
// the color-contrast rule is known not to work with JSDOM" - JSDOM has no
// real layout/rendering engine, so computed dimensions and visibility are
// unreliable for that one rule. Every other rule (missing alt text, invalid
// ARIA, duplicate/unlabeled landmarks, heading order, form labels, etc.)
// only depends on real DOM structure, which JSDOM represents correctly.
const results = await axe.run(dom.window.document, {
  rules: { "color-contrast": { enabled: false } },
});

process.stdout.write(
  JSON.stringify({
    violations: results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      helpUrl: violation.helpUrl,
      nodes: violation.nodes.map((node) => ({
        html: node.html,
        failureSummary: node.failureSummary,
      })),
    })),
  }),
);
