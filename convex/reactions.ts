import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { reactionKind } from "./schema";
import { requireMember } from "./lib";

export const toggle = mutation({
  args: { entryId: v.id("reviewEntries"), kind: reactionKind },
  handler: async (ctx, { entryId, kind }) => {
    const user = await requireMember(ctx);
    const entry = await ctx.db.get(entryId);
    if (!entry) return;
    const count = entry.reactionCount ?? 0;
    const existing = await ctx.db
      .query("reactions")
      .withIndex("by_entry_user_kind", (q) =>
        q.eq("entryId", entryId).eq("userId", user._id).eq("kind", kind),
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      await ctx.db.patch(entryId, { reactionCount: Math.max(0, count - 1) });
    } else {
      await ctx.db.insert("reactions", {
        entryId,
        userId: user._id,
        kind,
        createdAt: Date.now(),
      });
      await ctx.db.patch(entryId, { reactionCount: count + 1 });
    }
  },
});
