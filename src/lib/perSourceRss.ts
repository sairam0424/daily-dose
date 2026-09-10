import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { getCollection } from "astro:content";
import type { DigestItem } from "./digestSchema.js";
import { groupEntriesByDate } from "./digestGrouping.js";
import { renderDayContent } from "./rssContent.js";

const SOURCE_LABELS: Record<DigestItem["source"], string> = {
  hn: "Hacker News",
  arxiv: "arXiv",
  github: "GitHub",
  devto: "Dev.to",
};

/**
 * Builds one RSS feed scoped to a single source, reusing the exact same
 * renderDayContent()/rss() machinery the combined /rss.xml feed uses (see
 * src/pages/rss.xml.ts) - filtered down to one source per date group, and
 * skipping any date with zero matching items entirely (never an empty
 * <item>). See docs/superpowers/specs/2026-09-03-methodology-reading-time-persource-rss-design.md
 * Feature 3.
 */
export async function buildSourceFeed(
  context: APIContext,
  source: DigestItem["source"],
): Promise<Response> {
  if (!context.site) {
    throw new Error(
      `[rss/${source}.xml] Astro \`site\` is not configured in astro.config.mjs - @astrojs/rss requires it to build absolute URLs.`,
    );
  }

  const sourceLabel = SOURCE_LABELS[source];
  const allEntries = await getCollection("digest");
  const dateGroups = groupEntriesByDate(allEntries);

  const items = dateGroups
    .map((group) => ({
      date: group.date,
      entries: group.entries.filter((entry) => entry.data.source === source),
    }))
    .filter((group) => group.entries.length > 0)
    .map((group) => ({
      title: `The Daily Dose — ${group.date}`,
      pubDate: new Date(group.date),
      link: `/archive/${group.date}/`,
      content: renderDayContent(group.entries.map((entry) => entry.data)),
    }));

  return rss({
    title: `The Daily Dose — ${sourceLabel}`,
    description: `${sourceLabel} picks from the daily-dose digest — a daily AI-curated technical digest.`,
    site: context.site,
    xmlns: { atom: "http://www.w3.org/2005/Atom" },
    // Per-source routes each need their own correct self-URL, not the
    // combined /rss.xml feed's — context.request.url is this specific
    // route's real request (e.g. /rss/hn.xml), not a shared constant.
    customData: `<atom:link href="${new URL(context.request.url).href}" rel="self" type="application/rss+xml" />`,
    items,
  });
}
