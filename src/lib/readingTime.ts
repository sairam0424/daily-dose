import type { DigestItem } from "./digestSchema.js";

/** Renders an honest per-source badge: a fixed format label where no body
 * text is ever fetched (HN, GitHub - never a fabricated time), a real
 * word-count-derived estimate where it is (arXiv, Dev.to), and a
 * source-appropriate fallback label if reading_minutes is unexpectedly
 * absent (an old record written before this feature shipped - schema
 * allows the field as optional, so this must never throw). */
export function formatReadingBadge(item: DigestItem): string {
  switch (item.source) {
    case "hn":
      return "Discussion";
    case "github":
      return "Repo";
    case "arxiv":
      return typeof item.reading_minutes === "number"
        ? `~${item.reading_minutes} min read`
        : "Paper";
    case "devto":
      return typeof item.reading_minutes === "number"
        ? `~${item.reading_minutes} min excerpt`
        : "Article";
  }
}
