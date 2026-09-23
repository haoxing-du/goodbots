import { v } from "convex/values";
import { query, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { avg, axisIndex, compareAxes, publicAxis, publicUser, statsFor } from "./lib";

async function versionsOf(ctx: QueryCtx, providerId: Id<"providers">) {
  const versions = await ctx.db
    .query("versions")
    .withIndex("by_provider", (q) => q.eq("providerId", providerId))
    .collect();
  return versions
    .filter((ver) => ver.status === "active")
    .sort((a, b) => (b.releasedAt ?? 0) - (a.releasedAt ?? 0));
}

/**
 * Every model with a page, with its headline numbers, best overall first
 * (unrated last). `provider` is for grouping.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const [providers, axes] = await Promise.all([
      ctx.db.query("providers").collect(),
      axisIndex(ctx),
    ]);
    const coreAxes = [...axes.values()]
      .filter((a) => a.core && a.status === "active")
      .sort(compareAxes);

    const versions = [];
    for (const p of providers) {
      for (const ver of await versionsOf(ctx, p._id)) {
        const [stats, axisStats] = await Promise.all([
          statsFor(ctx, ver._id),
          ctx.db
            .query("axisStats")
            .withIndex("by_version_axis", (q) => q.eq("versionId", ver._id))
            .collect(),
        ]);
        const byAxis = new Map(axisStats.map((s) => [s.axisId, s]));
        versions.push({
          _id: ver._id,
          versionId: ver.versionId,
          displayName: ver.displayName,
          releasedAt: ver.releasedAt ?? 0,
          provider: p.name,
          providerSlug: p.slug,
          reviewCount: stats?.reviewCount ?? 0,
          overall: stats ? avg(stats.overall) : null,
          axes: coreAxes.map((a) => {
            const s = byAxis.get(a._id);
            return { _id: a._id, name: a.name, avg: s ? avg(s) : null };
          }),
        });
      }
    }
    return versions.sort(
      (a, b) => (b.overall ?? -1) - (a.overall ?? -1) || b.reviewCount - a.reviewCount,
    );
  },
});

/**
 * One model's page. `kind: "catalog"` means the id is in the OpenRouter catalog
 * but nobody has reviewed it yet (the page invites the first review).
 */
export const page = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const version = await ctx.db
      .query("versions")
      .withIndex("by_versionId", (q) => q.eq("versionId", id))
      .unique();
    if (version?.mergedInto) return { kind: "redirect", to: version.mergedInto } as const;
    if (!version || version.status !== "active") {
      const entry = await ctx.db
        .query("catalog")
        .withIndex("by_orId", (q) => q.eq("orId", id))
        .unique();
      return entry
        ? ({
            kind: "catalog",
            entry: { orId: entry.orId, name: entry.name, provider: entry.provider, releasedAt: entry.releasedAt },
          } as const)
        : null;
    }
    const provider = await ctx.db.get(version.providerId);

    const [stats, axisStats, axisDocs] = await Promise.all([
      statsFor(ctx, version._id),
      ctx.db
        .query("axisStats")
        .withIndex("by_version_axis", (q) => q.eq("versionId", version._id))
        .collect(),
      axisIndex(ctx),
    ]);
    const overall = {
      avg: stats ? avg(stats.overall) : null,
      count: stats?.overall.count ?? 0,
      hist: stats?.overall.hist ?? [0, 0, 0, 0, 0],
    };
    // Core axes always; custom axes once anyone has rated this version on them.
    const byAxis = new Map(axisStats.map((s) => [s.axisId, s]));
    const axes = [...axisDocs.values()]
      .filter((a) => a.status === "active" && (a.core || (byAxis.get(a._id)?.count ?? 0) > 0))
      .sort(compareAxes)
      .map((a) => {
        const s = byAxis.get(a._id);
        return {
          ...publicAxis(a),
          avg: s ? avg(s) : null,
          count: s?.count ?? 0,
          hist: s?.hist ?? [0, 0, 0, 0, 0],
        };
      });

    // Head to head: group takes involving this version by opponent. Takes are
    // unlimited, but win % counts only each person's latest take per matchup,
    // so one person posting the same take repeatedly can't swing it.
    const [wins, losses] = await Promise.all([
      ctx.db
        .query("takes")
        .withIndex("by_winner", (q) => q.eq("winnerVersionId", version._id))
        .collect(),
      ctx.db
        .query("takes")
        .withIndex("by_loser", (q) => q.eq("loserVersionId", version._id))
        .collect(),
    ]);
    const byOpp = new Map<
      Id<"versions">,
      { wins: number; total: number; quote: Doc<"takes"> | null }
    >();
    const latest = new Map<string, { take: Doc<"takes">; opp: Id<"versions">; won: boolean }>();
    const consider = (t: Doc<"takes">, opp: Id<"versions">, won: boolean) => {
      const key = `${t.userId}|${opp}`;
      const prev = latest.get(key);
      if (!prev || t.createdAt > prev.take.createdAt) latest.set(key, { take: t, opp, won });
      // The quote is the newest take with a reason, from anyone.
      const row = byOpp.get(opp) ?? { wins: 0, total: 0, quote: null };
      if (t.reason && (!row.quote || t.createdAt > row.quote.createdAt)) row.quote = t;
      byOpp.set(opp, row);
    };
    for (const t of wins) consider(t, t.loserVersionId, true);
    for (const t of losses) consider(t, t.winnerVersionId, false);
    for (const { opp, won } of latest.values()) {
      const row = byOpp.get(opp)!;
      row.total++; // one vote per person
      if (won) row.wins++;
    }

    const headToHead = await Promise.all(
      [...byOpp.entries()]
        .sort((a, b) => b[1].total - a[1].total)
        .map(async ([oppId, row]) => {
          const opp = await ctx.db.get(oppId);
          const quoteUser = row.quote ? await ctx.db.get(row.quote.userId) : null;
          return {
            opponent: opp
              ? {
                  _id: opp._id,
                  displayName: opp.displayName,
                  versionId: opp.versionId,
                }
              : null,
            winPct: Math.round((100 * row.wins) / row.total),
            total: row.total,
            quote: row.quote?.reason ?? null,
            quoteBy: quoteUser ? publicUser(quoteUser).handle : null,
          };
        }),
    );

    return {
      kind: "page",
      provider: provider?.name ?? "",
      version,
      reviewCount: stats?.reviewCount ?? 0,
      takeCount: stats?.takeCount ?? 0,
      overall,
      axes,
      headToHead: headToHead.filter((h) => h.opponent),
    } as const;
  },
});

/** All models with pages, for pickers (take composer). */
export const allVersions = query({
  args: {},
  handler: async (ctx) => {
    const versions = await ctx.db.query("versions").collect();
    return versions
      .filter((ver) => ver.status === "active")
      .map((ver) => ({ _id: ver._id, versionId: ver.versionId, displayName: ver.displayName }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  },
});
