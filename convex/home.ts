import { query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { avg, compareAxes, publicAxis } from "./lib";
import { featuredModels } from "./featured";

const WEEK = 7 * 24 * 60 * 60 * 1000;
/** A version needs this many ratings (on that axis) to win a "best" card. */
export const MIN_REVIEWS_FOR_BEST = 20;

// `slug` is an axis slug, or "overall" for overall stars.
const BEST_CARDS = [
  { slug: "overall", label: "Overall best", caption: "★ overall" },
  { slug: "vibes", label: "Best vibes", caption: "vibes" },
  { slug: "smarts", label: "Smartest", caption: "smarts" },
  { slug: "taste", label: "Best taste", caption: "taste" },
  { slug: "aligned", label: "Most aligned", caption: "aligned" },
] as const;

/** Everything the homepage needs in one call: hero counts, model picker, six stat cards. */
export const homeStats = query({
  args: {},
  handler: async (ctx) => {
    const [allStats, site] = await Promise.all([
      ctx.db.query("versionStats").collect(),
      ctx.db.query("siteStats").first(),
    ]);

    // Join stats with active versions.
    const rows: { stats: Doc<"versionStats">; version: Doc<"versions"> }[] = [];
    for (const stats of allStats) {
      const version = await ctx.db.get(stats.versionId);
      if (version?.status === "active") rows.push({ stats, version });
    }
    rows.sort((a, b) => b.stats.reviewCount - a.stats.reviewCount);

    const ref = (r: (typeof rows)[number]) => ({
      _id: r.version._id,
      versionId: r.version.versionId,
      displayName: r.version.displayName,
    });

    const axes = await ctx.db.query("axes").collect();
    const bySlug = new Map(axes.map((a) => [a.slug, a]));
    const rowByVersion = new Map(rows.map((r) => [r.version._id, r]));

    const best = [];
    for (const card of BEST_CARDS) {
      // Candidate (version, stat) pairs: overall stars, or that axis's axisStats.
      let candidates: { row: (typeof rows)[number]; stat: { sum: number; count: number } }[];
      if (card.slug === "overall") {
        candidates = rows.map((row) => ({ row, stat: row.stats.overall }));
      } else {
        const axis = bySlug.get(card.slug);
        const stats = axis
          ? await ctx.db
              .query("axisStats")
              .withIndex("by_axis", (q) => q.eq("axisId", axis._id))
              .collect()
          : [];
        candidates = stats.flatMap((stat) => {
          const row = rowByVersion.get(stat.versionId);
          return row ? [{ row, stat }] : [];
        });
      }
      let winner: { row: (typeof rows)[number]; value: number; count: number } | null = null;
      for (const { row, stat } of candidates) {
        if (stat.count < MIN_REVIEWS_FOR_BEST) continue;
        const value = avg(stat)!;
        if (!winner || value > winner.value || (value === winner.value && stat.count > winner.count)) {
          winner = { row, value, count: stat.count };
        }
      }
      best.push({
        key: card.slug,
        label: card.label,
        version: winner ? ref(winner.row) : null,
        value: winner ? winner.value.toFixed(1) : null,
        caption: winner
          ? `${card.caption} · ${winner.count.toLocaleString("en-US")} ratings`
          : `Needs a model with ${MIN_REVIEWS_FOR_BEST}+ ratings`,
      });
    }

    // Most reviewed this week: reviews posted or updated in the last 7 days.
    const recent = await ctx.db
      .query("reviews")
      .withIndex("by_updatedAt", (q) => q.gte("updatedAt", Date.now() - WEEK))
      .collect();
    const weekly = new Map<Id<"versions">, number>();
    for (const r of recent) weekly.set(r.versionId, (weekly.get(r.versionId) ?? 0) + 1);
    const topWeekly = rows
      .map((row) => ({ row, n: weekly.get(row.version._id) ?? 0 }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)[0];

    const cards = [
      ...best,
      {
        key: "week",
        label: "Most reviewed this week",
        version: topWeekly ? ref(topWeekly.row) : null,
        value: topWeekly ? topWeekly.n.toLocaleString("en-US") : null,
        caption: topWeekly ? "reviews in the last 7 days" : "No reviews this week yet",
      },
    ];

    return {
      reviewerCount: site?.reviewerCount ?? 0,
      reviewedModelCount: rows.filter((r) => r.stats.reviewCount > 0).length,
      // Headline select: the admin-picked featured models (the hero defaults to the first).
      versions: await featuredModels(ctx),
      // Axes the hero can suggest: the core ones only.
      axes: axes
        .filter((a) => a.core && a.status === "active")
        .sort(compareAxes)
        .map(publicAxis),
      cards,
    };
  },
});
