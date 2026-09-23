import { ConvexError, v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internalQuery, mutation, query } from "./_generated/server";
import { assertClean } from "./moderation";
import { Id } from "./_generated/dataModel";
import {
  getViewer,
  isAdmin,
  publicUser,
  deleteReviewCascade,
  deleteTake,
  requireUser,
  scoreMapFor,
  axisIndex,
  compareAxes,
  publicAxis,
  scoresForReview,
  tasteMatch,
  versionLabel,
} from "./lib";

export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getViewer(ctx);
    if (!user) return null;
    return { ...publicUser(user), isAdmin: isAdmin(user), needsHandle: !user.handle };
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

    const axes = await axisIndex(ctx);
    const coreAxes = [...axes.values()]
      .filter((a) => a.core && a.status === "active")
      .sort(compareAxes)
      .map(publicAxis);
    const ratings = await Promise.all(
      reviews.map(async (r) => ({
        _id: r._id,
        version: await versionLabel(ctx, r.versionId),
        overall: r.overall,
        scores: await scoresForReview(ctx, r._id, axes),
        updatedAt: r.updatedAt,
      })),
    );

    // Most recently touched review, with its full history (newest first).
    const latest = reviews[0];
    const latestReview = latest
      ? {
          _id: latest._id,
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
      coreAxes,
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
    assertClean(name, "name");
    assertClean(handle, "handle");
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

/**
 * Permanently deletes the signed-in user: their reviews (with history, scores
 * and stats), takes, reactions, model requests, sign-in accounts and sessions.
 * Axes they created stay (other people rate on them).
 */
export const deleteAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const userId = user._id;

    for (const review of await ctx.db
      .query("reviews")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()) {
      await deleteReviewCascade(ctx, review);
    }
    for (const take of await ctx.db
      .query("takes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()) {
      await deleteTake(ctx, take);
    }
    for (const reaction of await ctx.db
      .query("reactions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()) {
      const review = await ctx.db.get(reaction.reviewId);
      if (review) await ctx.db.patch(review._id, { reactionCount: Math.max(0, review.reactionCount - 1) });
      await ctx.db.delete(reaction._id);
    }
    for (const req of await ctx.db
      .query("modelRequests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()) {
      await ctx.db.delete(req._id);
    }
    for (const axis of await ctx.db
      .query("axes")
      .withIndex("by_creator", (q) => q.eq("createdBy", userId))
      .collect()) {
      await ctx.db.patch(axis._id, { createdBy: undefined });
    }

    // Sign-in records: sessions (+ refresh tokens), linked accounts, pending codes.
    for (const session of await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect()) {
      for (const token of await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
        .collect()) {
        await ctx.db.delete(token._id);
      }
      await ctx.db.delete(session._id);
    }
    for (const account of await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect()) {
      for (const code of await ctx.db
        .query("authVerificationCodes")
        .withIndex("accountId", (q) => q.eq("accountId", account._id))
        .collect()) {
        await ctx.db.delete(code._id);
      }
      await ctx.db.delete(account._id);
    }
    await ctx.db.delete(userId);
  },
});
