import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  applyOverallToStats,
  bumpAxis,
  bumpTakeCount,
  compareAxes,
  createVersion,
  deleteReviewCascade,
  normalizeVersionId,
  publicUser,
  removeFromVersionStats,
  replaceReviewScores,
  requireAdmin,
} from "./lib";
import { Doc } from "./_generated/dataModel";

/** Adds a model page by hand (for models not in the OpenRouter catalog). */
export const addVersion = mutation({
  args: {
    provider: v.string(),
    versionId: v.string(),
    displayName: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (!args.provider.trim() || !args.versionId.trim() || !args.displayName.trim()) {
      throw new ConvexError("Provider, model id and display name are required.");
    }
    await createVersion(ctx, {
      versionId: normalizeVersionId(args.provider, args.versionId.trim()),
      displayName: args.displayName,
      provider: args.provider,
      releasedAt: Date.now(),
      source: "manual",
    });
  },
});

/**
 * Merge one model page into another (duplicates, e.g. a hand-added model that
 * later appears in the catalog). Reviews, scores and takes move over; where
 * someone reviewed both, their newer review wins. The old page redirects.
 */
export const mergeVersion = mutation({
  args: { from: v.string(), into: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.from === args.into) throw new ConvexError("Pick two different models.");
    const byId = (id: string) =>
      ctx.db
        .query("versions")
        .withIndex("by_versionId", (q) => q.eq("versionId", id))
        .unique();
    const [from, into] = await Promise.all([byId(args.from), byId(args.into)]);
    if (!from || !into || from.status !== "active" || into.status !== "active") {
      throw new ConvexError("Both models need to have active pages.");
    }

    const move = async (review: Doc<"reviews">) => {
      const scores = await ctx.db
        .query("reviewScores")
        .withIndex("by_review", (q) => q.eq("reviewId", review._id))
        .collect();
      const kept = new Map(scores.map((r) => [r.axisId, r.score]));
      await replaceReviewScores(ctx, review, new Map()); // out of `from`'s axis stats
      await removeFromVersionStats(ctx, review);
      await ctx.db.patch(review._id, { versionId: into._id });
      await applyOverallToStats(ctx, into._id, null, review.overall);
      await replaceReviewScores(ctx, { ...review, versionId: into._id }, kept);
    };

    let moved = 0;
    let dropped = 0;
    for (const review of await ctx.db
      .query("reviews")
      .withIndex("by_version", (q) => q.eq("versionId", from._id))
      .collect()) {
      const existing = await ctx.db
        .query("reviews")
        .withIndex("by_user_version", (q) => q.eq("userId", review.userId).eq("versionId", into._id))
        .unique();
      if (existing && existing.updatedAt >= review.updatedAt) {
        await deleteReviewCascade(ctx, review);
        dropped++;
        continue;
      }
      if (existing) {
        await deleteReviewCascade(ctx, existing);
        dropped++;
      }
      await move(review);
      moved++;
    }

    for (const field of ["winnerVersionId", "loserVersionId"] as const) {
      const takes = await ctx.db
        .query("takes")
        .withIndex(field === "winnerVersionId" ? "by_winner" : "by_loser", (q) => q.eq(field, from._id))
        .collect();
      for (const take of takes) {
        await bumpTakeCount(ctx, from._id, -1);
        const other = field === "winnerVersionId" ? take.loserVersionId : take.winnerVersionId;
        if (other === into._id) {
          // "into > into" makes no sense; drop it.
          await bumpTakeCount(ctx, into._id, -1);
          await ctx.db.delete(take._id);
        } else {
          await ctx.db.patch(take._id, { [field]: into._id });
          await bumpTakeCount(ctx, into._id, 1);
        }
      }
    }

    await ctx.db.patch(from._id, { status: "hidden", mergedInto: into.versionId });
    return { moved, dropped };
  },
});

// ---------- axes ----------

export const axes = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const all = (await ctx.db.query("axes").collect()).sort(compareAxes);
    return await Promise.all(
      all.map(async (a) => {
        const creator = a.createdBy ? await ctx.db.get(a.createdBy) : null;
        return {
          _id: a._id,
          name: a.name,
          core: a.core,
          status: a.status,
          ratingCount: a.ratingCount,
          createdBy: creator ? publicUser(creator) : null,
          createdAt: a.createdAt,
        };
      }),
    );
  },
});

/** Hide or unhide a custom axis. Hidden axes vanish from forms, pages and cards; scores are kept. */
export const setAxisStatus = mutation({
  args: { axisId: v.id("axes"), status: v.union(v.literal("active"), v.literal("hidden")) },
  handler: async (ctx, { axisId, status }) => {
    await requireAdmin(ctx);
    const axis = await ctx.db.get(axisId);
    if (!axis) throw new ConvexError("Unknown axis.");
    if (axis.core) throw new ConvexError("Core axes can't be hidden.");
    await ctx.db.patch(axisId, { status });
  },
});

/**
 * Merge a custom axis into another (e.g. "UI design" → "Design"). Scores move
 * over; where a review rated both, the target's score wins. The source axis is deleted.
 */
export const mergeAxis = mutation({
  args: { fromId: v.id("axes"), intoId: v.id("axes") },
  handler: async (ctx, { fromId, intoId }) => {
    await requireAdmin(ctx);
    if (fromId === intoId) throw new ConvexError("Pick two different axes.");
    const [from, into] = await Promise.all([ctx.db.get(fromId), ctx.db.get(intoId)]);
    if (!from || !into) throw new ConvexError("Unknown axis.");
    if (from.core) throw new ConvexError("Core axes can't be merged away.");

    const rows = await ctx.db
      .query("reviewScores")
      .withIndex("by_axis", (q) => q.eq("axisId", fromId))
      .collect();
    let moved = 0;
    for (const row of rows) {
      await bumpAxis(ctx, row.versionId, fromId, row.score, -1);
      const both = await ctx.db
        .query("reviewScores")
        .withIndex("by_review", (q) => q.eq("reviewId", row.reviewId))
        .filter((q) => q.eq(q.field("axisId"), intoId))
        .first();
      if (both) {
        await ctx.db.delete(row._id);
      } else {
        await ctx.db.patch(row._id, { axisId: intoId });
        await bumpAxis(ctx, row.versionId, intoId, row.score, 1);
        moved++;
      }
    }
    for (const stat of await ctx.db
      .query("axisStats")
      .withIndex("by_axis", (q) => q.eq("axisId", fromId))
      .collect()) {
      await ctx.db.delete(stat._id);
    }
    await ctx.db.delete(fromId);
    return { moved, dropped: rows.length - moved };
  },
});
