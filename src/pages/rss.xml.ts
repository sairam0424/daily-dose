import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { getCollection } from "astro:content";
import { groupEntriesByDate } from "../lib/digestGrouping.js";
import { renderDayContent } from "../lib/rssContent.js";

export async function GET(context: APIContext) {
  if (!context.site) {
    // Fail loudly rather than silently emitting relative (spec-invalid) RSS
    // links — matches this project's "no silent degrade" posture.
    throw new Error(
      "[rss.xml] Astro `site` is not configured in astro.config.mjs — @astrojs/rss requires it to build absolute URLs.",
    );
  }

  const allEntries = await getCollection("digest");
  const dateGroups = groupEntriesByDate(allEntries);

  return rss({
    title: "The Daily Dose",
    description:
      "A daily AI-curated technical digest — Hacker News, arXiv, GitHub, and Dev.to.",
    site: context.site,
    items: dateGroups.map((group) => ({
      title: `The Daily Dose — ${group.date}`,
      // group.date is always a real "YYYY-MM-DD" string validated by
      // digestSchema.ts, so this is a real calendar date, not a fabricated one.
      pubDate: new Date(group.date),
      link: `/archive/${group.date}/`,
      content: renderDayContent(group.entries.map((entry) => entry.data)),
    })),
  });
}
