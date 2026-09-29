import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { currentScores } from "./lib";

/**
 * One-off, for reviews becoming posts: gives every post its author, model and
 * reaction count, gives the review's current ratings to the post they were set
 * with, and moves each reaction to the post that was newest when it was left.
 * Safe to run again. Small tables, so one transaction.
 */
export const postsBackfill = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { dryRun }) => {
    let posts = 0;
    let reactions = 0;
    const legacyReactions = new Map<Id<"reviews">, Doc<"reactions">[]>();
    for (const r of await ctx.db.query("reactions").collect()) {
      if (!r.reviewId) continue;
      legacyReactions.set(r.reviewId, [...(legacyReactions.get(r.reviewId) ?? []), r]);
    }
    for (const review of await ctx.db.query("reviews").collect()) {
      const entries = await ctx.db
        .query("reviewEntries")
        .withIndex("by_review", (q) => q.eq("reviewId", review._id))
        .collect();
      // The current ratings were set with the latest post written here; posts from X
      // came without ratings. Only if every post is from X were they added to the latest.
      const rated = entries.filter((e) => !e.xUrl).at(-1) ?? entries.at(-1);
      for (const e of entries) {
        const latest = e._id === rated?._id;
        if (!dryRun) {
          await ctx.db.patch(e._id, {
            userId: review.userId,
            versionId: review.versionId,
            ...(latest && e.overallAtTime === undefined ? { overallAtTime: review.overall } : {}),
            ...(latest && e.scoresAtTime === undefined
              ? { scoresAtTime: await currentScores(ctx, review._id) }
              : {}),
          });
        }
        posts++;
      }
      for (const r of legacyReactions.get(review._id) ?? []) {
        const at = entries.filter((e) => e.createdAt <= r.createdAt).at(-1) ?? entries[0];
        if (!dryRun) {
          if (at) await ctx.db.patch(r._id, { entryId: at._id, reviewId: undefined });
          else await ctx.db.delete(r._id);
        }
        reactions++;
      }
      if (!dryRun && review.reactionCount !== undefined) {
        await ctx.db.patch(review._id, { reactionCount: undefined });
      }
    }
    if (!dryRun) {
      for (const e of await ctx.db.query("reviewEntries").collect()) {
        const n = (
          await ctx.db
            .query("reactions")
            .withIndex("by_entry", (q) => q.eq("entryId", e._id))
            .collect()
        ).length;
        if (e.reactionCount !== n) await ctx.db.patch(e._id, { reactionCount: n });
      }
    }
    return { posts, reactions };
  },
});
