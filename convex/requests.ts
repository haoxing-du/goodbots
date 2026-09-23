import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { publicUser, requireAdmin, requireMember } from "./lib";
import { createVersion } from "./admin";

export const create = mutation({
  args: {
    family: v.string(),
    versionId: v.string(),
    provider: v.string(),
    link: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireMember(ctx);
    const clean = {
      family: args.family.trim(),
      versionId: args.versionId.trim(),
      provider: args.provider.trim(),
      link: args.link.trim(),
    };
    if (!clean.family || !clean.versionId || !clean.provider) {
      throw new ConvexError("Family, version id and provider are required.");
    }
    await ctx.db.insert("modelRequests", {
      userId: user._id,
      ...clean,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

export const pending = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const requests = await ctx.db
      .query("modelRequests")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    return await Promise.all(
      requests.map(async (r) => {
        const user = await ctx.db.get(r.userId);
        return { ...r, user: user ? publicUser(user) : null };
      }),
    );
  },
});

export const resolve = mutation({
  args: {
    requestId: v.id("modelRequests"),
    approve: v.boolean(),
    displayName: v.optional(v.string()),
  },
  handler: async (ctx, { requestId, approve, displayName }) => {
    await requireAdmin(ctx);
    const req = await ctx.db.get(requestId);
    if (!req || req.status !== "pending") return;
    if (approve) {
      await createVersion(ctx, {
        family: req.family,
        provider: req.provider,
        versionId: req.versionId,
        displayName: displayName?.trim() || req.family,
      });
    }
    await ctx.db.patch(requestId, { status: approve ? "approved" : "rejected" });
  },
});
