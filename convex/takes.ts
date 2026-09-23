import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { bumpTakeCount, deleteTake, isAdmin, requireMember } from "./lib";

export const create = mutation({
  args: {
    winnerVersionId: v.id("versions"),
    loserVersionId: v.id("versions"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { winnerVersionId, loserVersionId, reason }) => {
    const user = await requireMember(ctx);
    if (winnerVersionId === loserVersionId) {
      throw new ConvexError("Pick two different models.");
    }
    const [a, b] = await Promise.all([
      ctx.db.get(winnerVersionId),
      ctx.db.get(loserVersionId),
    ]);
    if (!a || !b) throw new ConvexError("Unknown model.");
    const trimmed = reason?.trim().slice(0, 200);
    await ctx.db.insert("takes", {
      userId: user._id,
      winnerVersionId,
      loserVersionId,
      reason: trimmed || undefined,
      createdAt: Date.now(),
    });
    await bumpTakeCount(ctx, winnerVersionId, 1);
    await bumpTakeCount(ctx, loserVersionId, 1);
  },
});

/** Delete your own take (admins can delete any). */
export const remove = mutation({
  args: { takeId: v.id("takes") },
  handler: async (ctx, { takeId }) => {
    const user = await requireMember(ctx);
    const take = await ctx.db.get(takeId);
    if (!take) return;
    if (take.userId !== user._id && !isAdmin(user)) {
      throw new ConvexError("You can only delete your own takes.");
    }
    await deleteTake(ctx, take);
  },
});
