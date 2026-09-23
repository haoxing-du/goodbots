import { query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { avg } from "./lib";

const WEEK = 7 * 24 * 60 * 60 * 1000;
/** A version needs this many reviews to win a "best" card. */
export const MIN_REVIEWS_FOR_BEST = 20;

const BEST_CARDS = [
  { key: "overall", label: "Overall best", caption: "★ overall" },
  { key: "vibes", label: "Best vibes", caption: "vibes" },
  { key: "smarts", label: "Smartest", caption: "smarts" },
  { key: "taste", label: "Best taste", caption: "taste" },
  { key: "mom", label: "Most mom-approved", caption: "mom-approved" },
] as const;

/** Everything the homepage needs in one call: hero counts, model picker, six stat cards. */
export const homeStats = query({
  args: {},
  handler: async (ctx) => {
    const [allStats, site] = await Promise.all([
      ctx.db.query("versionStats").collect(),
      ctx.db.query("siteStats").first(),
    ]);

    // Join stats with active versions and their model slugs.
    const rows: {
      stats: Doc<"versionStats">;
      version: Doc<"versions">;
      modelSlug: string;
    }[] = [];
    for (const stats of allStats) {
      const version = await ctx.db.get(stats.versionId);
      if (!version || version.status !== "active") continue;
      const model = await ctx.db.get(version.modelId);
      if (model) rows.push({ stats, version, modelSlug: model.slug });
    }
    rows.sort((a, b) => b.stats.reviewCount - a.stats.reviewCount);

    const ref = (r: (typeof rows)[number]) => ({
      _id: r.version._id,
      versionId: r.version.versionId,
      displayName: r.version.displayName,
      modelSlug: r.modelSlug,
    });

    const best = BEST_CARDS.map((card) => {
      let winner: { row: (typeof rows)[number]; value: number } | null = null;
      for (const row of rows) {
        if (row.stats.reviewCount < MIN_REVIEWS_FOR_BEST) continue;
        const value = avg(row.stats[card.key]);
        if (value === null) continue;
        // rows are sorted by review count, so ties go to the more-reviewed version
        if (!winner || value > winner.value) winner = { row, value };
      }
      return {
        key: card.key,
        label: card.label,
        version: winner ? ref(winner.row) : null,
        value: winner ? winner.value.toFixed(1) : null,
        caption: winner
          ? `${card.caption} · ${winner.row.stats.reviewCount.toLocaleString("en-US")} reviews`
          : `Needs a model with ${MIN_REVIEWS_FOR_BEST}+ reviews`,
      };
    });

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
      versions: rows.map(ref), // most-reviewed first; the hero defaults to versions[0]
      cards,
    };
  },
});
