import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { createVersion, normalizeVersionId, publicUser, requireAdmin, requireMember } from "./lib";

export const create = mutation({
  args: {
    name: v.string(),
    versionId: v.string(),
    provider: v.string(),
    link: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireMember(ctx);
    const clean = {
      name: args.name.trim(),
      versionId: args.versionId.trim(),
      provider: args.provider.trim(),
      link: args.link.trim(),
    };
    if (!clean.name || !clean.versionId || !clean.provider) {
      throw new ConvexError("Model name, id and provider are required.");
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
        versionId: normalizeVersionId(req.provider, req.versionId),
        displayName: displayName?.trim() || req.name,
        provider: req.provider,
        releasedAt: Date.now(),
        source: "manual",
      });
    }
    await ctx.db.patch(requestId, { status: approve ? "approved" : "rejected" });
  },
});
