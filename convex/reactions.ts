import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { reactionKind } from "./schema";
import { requireMember } from "./lib";

export const toggle = mutation({
  args: { reviewId: v.id("reviews"), kind: reactionKind },
  handler: async (ctx, { reviewId, kind }) => {
    const user = await requireMember(ctx);
    const review = await ctx.db.get(reviewId);
    if (!review) return;
    const existing = await ctx.db
      .query("reactions")
      .withIndex("by_review_user_kind", (q) =>
        q.eq("reviewId", reviewId).eq("userId", user._id).eq("kind", kind),
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      await ctx.db.patch(reviewId, { reactionCount: review.reactionCount - 1 });
    } else {
      await ctx.db.insert("reactions", {
        reviewId,
        userId: user._id,
        kind,
        createdAt: Date.now(),
      });
      await ctx.db.patch(reviewId, { reactionCount: review.reactionCount + 1 });
    }
  },
});
