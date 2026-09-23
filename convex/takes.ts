import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { createTake, deleteTake, isAdmin, requireMember } from "./lib";

export const create = mutation({
  args: {
    winnerVersionId: v.id("versions"),
    loserVersionId: v.id("versions"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { winnerVersionId, loserVersionId, reason }) => {
    const user = await requireMember(ctx);
    const [a, b] = await Promise.all([
      ctx.db.get(winnerVersionId),
      ctx.db.get(loserVersionId),
    ]);
    if (!a || !b) throw new ConvexError("Unknown model.");
    await createTake(ctx, user._id, winnerVersionId, loserVersionId, reason);
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
