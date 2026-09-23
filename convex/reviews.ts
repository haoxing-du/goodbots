import { ConvexError, v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import {
  applyScoresToStats,
  avg,
  bumpReviewerCount,
  AXES,
  checkScore,
  matcherFor,
  publicUser,
  REACTION_KINDS,
  ReactionKind,
  requireUser,
  scoresOf,
  statsFor,
  versionLabel,
} from "./lib";

const WEEK = 7 * 24 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

type Matcher = Awaited<ReturnType<typeof matcherFor>>;

/** Everything a review card (model page or feed) needs. */
export async function hydrateReview(
  ctx: QueryCtx,
  review: Doc<"reviews">,
  viewerId: Id<"users"> | null,
  match: Matcher,
) {
  const [user, version, latest, reactions] = await Promise.all([
    ctx.db.get(review.userId),
    versionLabel(ctx, review.versionId),
    ctx.db
      .query("reviewEntries")
      .withIndex("by_review", (q) => q.eq("reviewId", review._id))
      .order("desc")
      .first(),
    ctx.db
      .query("reactions")
      .withIndex("by_review", (q) => q.eq("reviewId", review._id))
      .collect(),
  ]);
  const counts = Object.fromEntries(REACTION_KINDS.map((k) => [k, 0])) as Record<
    ReactionKind,
    number
  >;
  const mine: ReactionKind[] = [];
  for (const r of reactions) {
    counts[r.kind]++;
    if (viewerId && r.userId === viewerId) mine.push(r.kind);
  }
  return {
    _id: review._id,
    user: user ? publicUser(user) : null,
    version,
    scores: scoresOf(review),
    text: latest?.text ?? "",
    prompt: latest?.prompt,
    response: latest?.response,
    updatedAt: review.updatedAt,
    createdAt: review.createdAt,
    reactionCounts: counts,
    myReactions: mine,
    match: await match(review.userId),
  };
}

export type ReviewCard = Awaited<ReturnType<typeof hydrateReview>>;

// ---------- mutations ----------

export const upsert = mutation({
  args: {
    versionId: v.id("versions"),
    overall: v.number(),
    smarts: v.optional(v.number()),
    taste: v.optional(v.number()),
    vibes: v.optional(v.number()),
    aligned: v.optional(v.number()),
    mom: v.optional(v.number()),
    text: v.string(),
    prompt: v.optional(v.string()),
    response: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const version = await ctx.db.get(args.versionId);
    if (!version || version.status !== "active") {
      throw new ConvexError("That version isn't available to review.");
    }
    checkScore(args.overall, "Overall");
    for (const a of AXES) checkScore(args[a], a);
    const text = args.text.trim();
    if (!text) throw new ConvexError("Write a few words about it.");

    const now = Date.now();
    const scores = {
      overall: args.overall,
      smarts: args.smarts,
      taste: args.taste,
      vibes: args.vibes,
      aligned: args.aligned,
      mom: args.mom,
    };
    const existing = await ctx.db
      .query("reviews")
      .withIndex("by_user_version", (q) =>
        q.eq("userId", user._id).eq("versionId", args.versionId),
      )
      .unique();

    let reviewId: Id<"reviews">;
    if (existing) {
      // An update: new scores replace the old ones; the entry is appended to history.
      await applyScoresToStats(ctx, args.versionId, scoresOf(existing), scores);
      await ctx.db.replace(existing._id, {
        userId: existing.userId,
        versionId: existing.versionId,
        reactionCount: existing.reactionCount,
        createdAt: existing.createdAt,
        updatedAt: now,
        ...scores,
      });
      reviewId = existing._id;
    } else {
      const firstReview =
        (await ctx.db
          .query("reviews")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .first()) === null;
      if (firstReview) await bumpReviewerCount(ctx, 1);
      reviewId = await ctx.db.insert("reviews", {
        userId: user._id,
        versionId: args.versionId,
        reactionCount: 0,
        createdAt: now,
        updatedAt: now,
        ...scores,
      });
      await applyScoresToStats(ctx, args.versionId, null, scores);
    }
    await ctx.db.insert("reviewEntries", {
      reviewId,
      text,
      prompt: args.prompt?.trim() || undefined,
      response: args.response?.trim() || undefined,
      overallAtTime: args.overall,
      createdAt: now,
    });
    return reviewId;
  },
});

// ---------- queries ----------

export const byVersion = query({
  args: { versionId: v.id("versions"), stars: v.optional(v.number()) },
  handler: async (ctx, { versionId, stars }) => {
    const viewerId = await getAuthUserId(ctx);
    const match = await matcherFor(ctx, viewerId);
    let reviews = await ctx.db
      .query("reviews")
      .withIndex("by_version_reactions", (q) => q.eq("versionId", versionId))
      .order("desc")
      .take(200);
    if (stars) reviews = reviews.filter((r) => r.overall === stars);
    return await Promise.all(
      reviews.slice(0, 50).map((r) => hydrateReview(ctx, r, viewerId, match)),
    );
  },
});

export const feed = query({
  args: { tab: v.union(v.literal("latest"), v.literal("top")) },
  handler: async (ctx, { tab }) => {
    const viewerId = await getAuthUserId(ctx);
    const match = await matcherFor(ctx, viewerId);
    let reviews: Doc<"reviews">[];
    if (tab === "latest") {
      reviews = await ctx.db
        .query("reviews")
        .withIndex("by_updatedAt")
        .order("desc")
        .take(30);
    } else {
      // Most reactions received in the last 7 days.
      const since = Date.now() - WEEK;
      const recent = await ctx.db
        .query("reactions")
        .withIndex("by_createdAt", (q) => q.gte("createdAt", since))
        .collect();
      const tally = new Map<Id<"reviews">, number>();
      for (const r of recent) tally.set(r.reviewId, (tally.get(r.reviewId) ?? 0) + 1);
      const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
      reviews = (await Promise.all(top.map(([id]) => ctx.db.get(id)))).filter(
        (r): r is Doc<"reviews"> => r !== null,
      );
    }
    return await Promise.all(
      reviews.map((r) => hydrateReview(ctx, r, viewerId, match)),
    );
  },
});

/** Header line for the home feed. */
export const feedSummary = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const week = await ctx.db
      .query("reviews")
      .withIndex("by_updatedAt", (q) => q.gte("updatedAt", now - WEEK))
      .collect();
    const today = week.filter((r) => r.updatedAt >= now - DAY).length;
    const perVersion = new Map<Id<"versions">, number>();
    for (const r of week) perVersion.set(r.versionId, (perVersion.get(r.versionId) ?? 0) + 1);
    const [mostId] = [...perVersion.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
    const most = mostId ? await versionLabel(ctx, mostId) : null;
    return { today, mostReviewed: most?.displayName ?? null };
  },
});

/** Data for the write-a-review screen. Never includes community scores. */
export const forWrite = query({
  args: {},
  handler: async (ctx) => {
    const viewerId = await getAuthUserId(ctx);
    const models = await ctx.db.query("models").collect();
    const options = [];
    for (const m of models.sort((a, b) => a.family.localeCompare(b.family))) {
      const versions = await ctx.db
        .query("versions")
        .withIndex("by_model", (q) => q.eq("modelId", m._id))
        .collect();
      for (const ver of versions) {
        if (ver.status !== "active") continue;
        options.push({
          _id: ver._id,
          versionId: ver.versionId,
          displayName: ver.displayName,
          modelSlug: m.slug,
        });
      }
    }
    const prior: Record<string, number> = {};
    if (viewerId) {
      const mine = await ctx.db
        .query("reviews")
        .withIndex("by_user", (q) => q.eq("userId", viewerId))
        .collect();
      for (const r of mine) prior[r.versionId] = r.createdAt;
    }
    return { options, prior };
  },
});

/**
 * Community averages for a version, returned only once the viewer has posted a
 * review of it (anti-anchoring).
 */
export const communityAfterPost = query({
  args: { versionId: v.id("versions") },
  handler: async (ctx, { versionId }) => {
    const viewerId = await getAuthUserId(ctx);
    if (!viewerId) return null;
    const mine = await ctx.db
      .query("reviews")
      .withIndex("by_user_version", (q) =>
        q.eq("userId", viewerId).eq("versionId", versionId),
      )
      .unique();
    if (!mine) return null;
    const stats = await statsFor(ctx, versionId);
    if (!stats) return null;
    return {
      mine: scoresOf(mine),
      avg: Object.fromEntries(
        (["overall", ...AXES] as const).map((k) => [k, avg(stats[k])]),
      ) as Record<"overall" | (typeof AXES)[number], number | null>,
    };
  },
});
