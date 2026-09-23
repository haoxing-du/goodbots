import { v } from "convex/values";
import { query, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { avg, axisIndex, compareAxes, publicAxis, publicUser, statsFor } from "./lib";

async function versionsOf(ctx: QueryCtx, modelId: Id<"models">) {
  const versions = await ctx.db
    .query("versions")
    .withIndex("by_model", (q) => q.eq("modelId", modelId))
    .collect();
  return versions
    .filter((ver) => ver.status === "active")
    .sort((a, b) => (b.releasedAt ?? 0) - (a.releasedAt ?? 0));
}

/**
 * Every active model version with its headline numbers, best overall first
 * (unrated last). Each version is its own model; `family` is only for grouping.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const [families, axes] = await Promise.all([
      ctx.db.query("models").collect(),
      axisIndex(ctx),
    ]);
    const coreAxes = [...axes.values()]
      .filter((a) => a.core && a.status === "active")
      .sort(compareAxes);

    const versions = [];
    for (const f of families) {
      for (const ver of await versionsOf(ctx, f._id)) {
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
          family: f.family,
          familySlug: f.slug,
          provider: f.provider,
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

/** The model page: header, axis stats and head-to-head for one version. */
/**
 * One model version's page (every version is its own page). If `id` is a family
 * slug instead (old links like /m/claude-opus), returns a redirect to that
 * family's newest version.
 */
export const page = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const version = await ctx.db
      .query("versions")
      .withIndex("by_versionId", (q) => q.eq("versionId", id))
      .unique();
    if (!version || version.status !== "active") {
      const family = await ctx.db
        .query("models")
        .withIndex("by_slug", (q) => q.eq("slug", id))
        .unique();
      const newest = family ? (await versionsOf(ctx, family._id))[0] : undefined;
      return newest ? ({ redirectTo: newest.versionId } as const) : null;
    }
    const model = (await ctx.db.get(version.modelId))!;

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

    // Head to head: group every take involving this version by opponent.
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
    const add = (t: Doc<"takes">, opp: Id<"versions">, won: boolean) => {
      const row = byOpp.get(opp) ?? { wins: 0, total: 0, quote: null };
      row.total++;
      if (won) row.wins++;
      if (t.reason && (!row.quote || t.createdAt > row.quote.createdAt)) row.quote = t;
      byOpp.set(opp, row);
    };
    for (const t of wins) add(t, t.loserVersionId, true);
    for (const t of losses) add(t, t.winnerVersionId, false);

    const headToHead = await Promise.all(
      [...byOpp.entries()]
        .sort((a, b) => b[1].total - a[1].total)
        .map(async ([oppId, row]) => {
          const opp = await ctx.db.get(oppId);
          const oppModel = opp ? await ctx.db.get(opp.modelId) : null;
          const quoteUser = row.quote ? await ctx.db.get(row.quote.userId) : null;
          return {
            opponent: opp
              ? {
                  _id: opp._id,
                  displayName: opp.displayName,
                  versionId: opp.versionId,
                  modelSlug: oppModel?.slug ?? "",
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
      redirectTo: null,
      model,
      version,
      reviewCount: stats?.reviewCount ?? 0,
      takeCount: stats?.takeCount ?? 0,
      overall,
      axes,
      headToHead: headToHead.filter((h) => h.opponent),
    } as const;
  },
});

/** All active versions, for pickers (take composer). */
export const allVersions = query({
  args: {},
  handler: async (ctx) => {
    const models = await ctx.db.query("models").collect();
    const out = [];
    for (const m of models) {
      for (const ver of await versionsOf(ctx, m._id)) {
        out.push({
          _id: ver._id,
          versionId: ver.versionId,
          displayName: ver.displayName,
          modelSlug: m.slug,
        });
      }
    }
    return out.sort((a, b) => a.displayName.localeCompare(b.displayName));
  },
});
