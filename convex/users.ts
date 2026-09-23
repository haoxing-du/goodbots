import { ConvexError, v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internalQuery, mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import {
  getViewer,
  isAdmin,
  publicUser,
  requireUser,
  scoreMapFor,
  scoresOf,
  tasteMatch,
  versionLabel,
} from "./lib";

export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getViewer(ctx);
    if (!user) return null;
    return { ...publicUser(user), isAdmin: isAdmin(user) };
  },
});

export const profile = query({
  args: { handle: v.string() },
  handler: async (ctx, { handle }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_handle", (q) => q.eq("handleLower", handle.toLowerCase()))
      .unique();
    if (!user) return null;

    const viewerId = await getAuthUserId(ctx);
    const theirs = await scoreMapFor(ctx, user._id);
    const match =
      viewerId && viewerId !== user._id
        ? tasteMatch(await scoreMapFor(ctx, viewerId), theirs)
        : null;

    const reviews = (
      await ctx.db
        .query("reviews")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect()
    ).sort((a, b) => b.updatedAt - a.updatedAt);

    const ratings = await Promise.all(
      reviews.map(async (r) => ({
        _id: r._id,
        version: await versionLabel(ctx, r.versionId),
        scores: scoresOf(r),
        updatedAt: r.updatedAt,
      })),
    );

    // Most recently touched review, with its full history (newest first).
    const latest = reviews[0];
    const latestReview = latest
      ? {
          version: await versionLabel(ctx, latest.versionId),
          overall: latest.overall,
          entries: (
            await ctx.db
              .query("reviewEntries")
              .withIndex("by_review", (q) => q.eq("reviewId", latest._id))
              .order("desc")
              .collect()
          ).map((e) => ({
            _id: e._id,
            text: e.text,
            overallAtTime: e.overallAtTime,
            createdAt: e.createdAt,
          })),
        }
      : null;

    const takeDocs = await ctx.db
      .query("takes")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
    const takes = await Promise.all(
      takeDocs.slice(0, 20).map(async (t) => ({
        _id: t._id,
        winner: await versionLabel(ctx, t.winnerVersionId),
        loser: await versionLabel(ctx, t.loserVersionId),
        reason: t.reason,
        createdAt: t.createdAt,
      })),
    );

    return {
      user: { ...publicUser(user), joinedAt: user.joinedAt ?? user._creationTime },
      isMe: viewerId === user._id,
      // Email sign-ups have no name until they set one.
      needsName: viewerId === user._id && !user.displayName && !user.name,
      match,
      reviewCount: reviews.length,
      takeCount: takeDocs.length,
      ratings,
      latestReview,
      takes,
    };
  },
});

/** Top 3 taste matches for the signed-in viewer. */
export const reviewersLikeYou = query({
  args: {},
  handler: async (ctx) => {
    const viewerId = await getAuthUserId(ctx);
    if (!viewerId) return [];
    const mine = await scoreMapFor(ctx, viewerId);
    const candidates = new Set<Id<"users">>();
    for (const versionId of mine.keys()) {
      const reviews = await ctx.db
        .query("reviews")
        .withIndex("by_version", (q) => q.eq("versionId", versionId))
        .collect();
      for (const r of reviews) if (r.userId !== viewerId) candidates.add(r.userId);
    }
    const scored = [];
    for (const userId of candidates) {
      const match = tasteMatch(mine, await scoreMapFor(ctx, userId));
      if (match === null) continue;
      const user = await ctx.db.get(userId);
      if (user) scored.push({ user: publicUser(user), match });
    }
    return scored.sort((a, b) => b.match - a.match).slice(0, 3);
  },
});

export const demoUserId = internalQuery({
  args: {},
  handler: async (ctx) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_handle", (q) => q.eq("handleLower", "demo"))
      .unique();
    return user?._id ?? null;
  },
});

export const updateProfile = mutation({
  args: { name: v.string(), handle: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const name = args.name.trim().replace(/\s+/g, " ");
    const handle = args.handle.trim().replace(/^@/, "");
    if (name.length < 1 || name.length > 50) {
      throw new ConvexError("Name must be 1–50 characters.");
    }
    if (!/^[A-Za-z0-9_]{3,20}$/.test(handle)) {
      throw new ConvexError("Handle must be 3–20 letters, numbers or underscores.");
    }
    const handleLower = handle.toLowerCase();
    const taken = await ctx.db
      .query("users")
      .withIndex("by_handle", (q) => q.eq("handleLower", handleLower))
      .first();
    if (taken && taken._id !== user._id) {
      throw new ConvexError(`@${handle} is taken.`);
    }
    await ctx.db.patch(user._id, {
      displayName: name,
      nameLower: name.toLowerCase(),
      handle,
      handleLower,
    });
    return handle;
  },
});
