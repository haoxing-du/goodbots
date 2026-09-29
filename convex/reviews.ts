import { ConvexError, v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, QueryCtx } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { Doc, Id } from "./_generated/dataModel";
import {
  applyOverallToStats,
  avg,
  axisIndex,
  bumpReviewerCount,
  checkScore,
  compareAxes,
  createTake,
  currentScores,
  deletePost,
  findOrActivateVersion,
  insertPost,
  isAdmin,
  matcherFor,
  namedScores,
  publicAxis,
  publicUser,
  REACTION_KINDS,
  ReactionKind,
  replaceReviewScores,
  requireMember,
  resolveScores,
  scoresForReview,
  statsFor,
  versionLabel,
} from "./lib";
import { claimImage } from "./uploads";

const WEEK = 7 * 24 * 60 * 60 * 1000;
/** Re-posting the same head-to-head within this long replaces it instead of adding another. */
const TAKE_REPLACE_WINDOW = 10 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

type Matcher = Awaited<ReturnType<typeof matcherFor>>;
type AxisMap = Awaited<ReturnType<typeof axisIndex>>;

/** Everything a post card (model page, feeds, a review's page) needs. */
export async function hydratePost(
  ctx: QueryCtx,
  entry: Doc<"reviewEntries">,
  viewerId: Id<"users"> | null,
  match: Matcher,
  axes: AxisMap,
) {
  // Posts carry their author and model; older ones get them from the review until backfilled.
  const owner =
    entry.userId && entry.versionId
      ? { userId: entry.userId, versionId: entry.versionId }
      : await ctx.db.get(entry.reviewId);
  const [user, version, reactions] = await Promise.all([
    owner ? ctx.db.get(owner.userId) : null,
    owner ? versionLabel(ctx, owner.versionId) : null,
    ctx.db
      .query("reactions")
      .withIndex("by_entry", (q) => q.eq("entryId", entry._id))
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
    _id: entry._id,
    reviewId: entry.reviewId,
    user: user ? publicUser(user) : null,
    version,
    // The ratings the author had when they wrote it.
    overall: entry.overallAtTime,
    scores: namedScores(entry.scoresAtTime ?? [], axes),
    text: entry.text,
    prompt: entry.prompt,
    response: entry.response,
    image: entry.image
      ? { entryId: entry._id, url: await ctx.storage.getUrl(entry.image), caption: entry.imageAlt }
      : null,
    xUrl: entry.xUrl, // the text is a post imported from X
    createdAt: entry.createdAt,
    editedAt: entry.editedAt,
    reactionCounts: counts,
    myReactions: mine,
    match: owner ? await match(owner.userId) : null,
  };
}

export type Post = Awaited<ReturnType<typeof hydratePost>>;

async function hydrateAll(ctx: QueryCtx, entries: Doc<"reviewEntries">[]) {
  const viewerId = await getAuthUserId(ctx);
  const [match, axes] = await Promise.all([matcherFor(ctx, viewerId), axisIndex(ctx)]);
  return await Promise.all(entries.map((e) => hydratePost(ctx, e, viewerId, match, axes)));
}

// ---------- mutations ----------

const scoreInput = v.object({
  axisId: v.optional(v.id("axes")),
  name: v.optional(v.string()), // a new (or existing) axis by name
  hint: v.optional(v.string()), // one-line description, used only when creating an axis
  score: v.number(),
});

/**
 * Posts a review of a model and sets your rating of it (which replaces your
 * previous one). With no text, or the same text as your latest post (adding
 * ratings to a post from X), it only updates the rating.
 */
export const upsert = mutation({
  args: {
    versionId: v.string(), // "<provider>/<model>"; a catalog model gets its page on first review
    overall: v.optional(v.number()),
    scores: v.array(scoreInput),
    text: v.string(),
    image: v.optional(v.id("_storage")), // a screenshot from uploads.register
    imageCaption: v.optional(v.string()),
    // Optional head-to-head posted with the review: this model vs. another on the site.
    versus: v.optional(
      v.object({
        versionId: v.id("versions"),
        reviewedWins: v.boolean(),
        reason: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireMember(ctx);
    checkScore(args.overall, "Overall");
    if (args.scores.length > 40) throw new ConvexError("That’s a lot of axes. Keep it under 40.");
    const caption = args.image ? args.imageCaption?.trim().replace(/\s+/g, " ") || undefined : undefined;
    if (caption && caption.length > 300) throw new ConvexError("Keep the caption under 300 characters.");
    const version = await findOrActivateVersion(ctx, args.versionId);
    if (!version) throw new ConvexError("That model isn’t available to review.");
    const versionId = version._id;
    const opponent = args.versus ? await ctx.db.get(args.versus.versionId) : null;
    if (args.versus && opponent?.status !== "active") {
      throw new ConvexError("That model isn’t available for a head-to-head.");
    }
    const text = args.text.trim();

    const now = Date.now();
    const existing = await ctx.db
      .query("reviews")
      .withIndex("by_user_version", (q) =>
        q.eq("userId", user._id).eq("versionId", versionId),
      )
      .unique();
    if (!text && (!existing || args.image)) throw new ConvexError("Write a few words about it.");
    const scores = await resolveScores(ctx, user._id, args.scores);

    let review: Doc<"reviews">;
    if (existing) {
      await applyOverallToStats(ctx, versionId, existing.overall, args.overall);
      await ctx.db.patch(existing._id, { overall: args.overall, updatedAt: now });
      review = (await ctx.db.get(existing._id))!;
    } else {
      const firstReview =
        (await ctx.db
          .query("reviews")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .first()) === null;
      if (firstReview) await bumpReviewerCount(ctx, 1);
      const reviewId = await ctx.db.insert("reviews", {
        userId: user._id,
        versionId: versionId,
        overall: args.overall,
        createdAt: now,
        updatedAt: now,
      });
      await applyOverallToStats(ctx, versionId, null, args.overall);
      review = (await ctx.db.get(reviewId))!;
    }
    await replaceReviewScores(ctx, review, scores);
    if (args.image) await claimImage(ctx, user._id, existing?._id ?? null, args.image);

    const ratings = {
      overallAtTime: args.overall,
      scoresAtTime: [...scores].map(([axisId, score]) => ({ axisId, score })),
    };
    const latest = existing
      ? await ctx.db
          .query("reviewEntries")
          .withIndex("by_review", (q) => q.eq("reviewId", review._id))
          .order("desc")
          .first()
      : null;
    let postId: Id<"reviewEntries"> | null = null;
    if (!text || (latest && latest.text === text && !args.image && !latest.image)) {
      // Only the rating changed. A post that was written without ratings (one from X)
      // takes these as its own; others keep the ratings they were written with.
      if (latest && !latest.overallAtTime && !latest.scoresAtTime?.length) {
        await ctx.db.patch(latest._id, ratings);
      }
    } else {
      postId = await insertPost(ctx, review, {
        text,
        image: args.image,
        imageAlt: caption,
        ...ratings,
        createdAt: now,
      });
    }
    if (args.versus && opponent) {
      const [winner, loser] = args.versus.reviewedWins
        ? [versionId, opponent._id]
        : [opponent._id, versionId];
      await createTake(ctx, user._id, winner, loser, args.versus.reason, TAKE_REPLACE_WINDOW);
    }
    return { reviewId: review._id, postId };
  },
});

/** Edit the text of one of your posts. */
export const editPost = mutation({
  args: { entryId: v.id("reviewEntries"), text: v.string() },
  handler: async (ctx, { entryId, text }) => {
    const user = await requireMember(ctx);
    const entry = await ctx.db.get(entryId);
    const review = entry && (await ctx.db.get(entry.reviewId));
    if (!entry || review?.userId !== user._id) throw new ConvexError("You can only edit your own reviews.");
    if (entry.xUrl) throw new ConvexError("This is your post from X, so it can’t be edited here. Post a new review instead.");
    const trimmed = text.trim();
    if (!trimmed) throw new ConvexError("Write a few words about it.");
    if (trimmed !== entry.text) await ctx.db.patch(entryId, { text: trimmed, editedAt: Date.now() });
  },
});

/** Delete one of your posts (admins can delete any). Deleting your last one on a model removes your rating too. */
export const removePost = mutation({
  args: { entryId: v.id("reviewEntries") },
  handler: async (ctx, { entryId }) => {
    const user = await requireMember(ctx);
    const entry = await ctx.db.get(entryId);
    if (!entry) return;
    const review = await ctx.db.get(entry.reviewId);
    if (review?.userId !== user._id && !isAdmin(user)) {
      throw new ConvexError("You can only delete your own reviews.");
    }
    await deletePost(ctx, entry);
  },
});

// ---------- queries ----------

/**
 * One person's reviews of one model (/r/:id): their current rating and every
 * post, newest first.
 */
export const get = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const reviewId = ctx.db.normalizeId("reviews", id);
    const review = reviewId ? await ctx.db.get(reviewId) : null;
    if (!review) return null;
    const viewerId = await getAuthUserId(ctx);
    const [user, version, match, axes, entries] = await Promise.all([
      ctx.db.get(review.userId),
      versionLabel(ctx, review.versionId),
      matcherFor(ctx, viewerId),
      axisIndex(ctx),
      ctx.db
        .query("reviewEntries")
        .withIndex("by_review", (q) => q.eq("reviewId", review._id))
        .order("desc")
        .collect(),
    ]);
    return {
      _id: review._id,
      user: user ? publicUser(user) : null,
      version,
      overall: review.overall,
      scores: await scoresForReview(ctx, review._id, axes),
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
      match: await match(review.userId),
      posts: await Promise.all(entries.map((e) => hydratePost(ctx, e, viewerId, match, axes))),
    };
  },
});

/** One post, for its share page (/p/:id), with how many its author wrote about the model. */
export const post = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const entryId = ctx.db.normalizeId("reviewEntries", id);
    const entry = entryId ? await ctx.db.get(entryId) : null;
    if (!entry) return null;
    const [post] = await hydrateAll(ctx, [entry]);
    const siblings = await ctx.db
      .query("reviewEntries")
      .withIndex("by_review", (q) => q.eq("reviewId", entry.reviewId))
      .take(100);
    return { ...post, postCount: siblings.length };
  },
});

/** A version's posts, most reactions first, optionally only ones with some star rating. Paginated. */
export const byVersion = query({
  args: {
    versionId: v.id("versions"),
    stars: v.optional(v.number()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { versionId, stars, paginationOpts }) => {
    const q = stars
      ? ctx.db
          .query("reviewEntries")
          .withIndex("by_version_overall_reactions", (q) =>
            q.eq("versionId", versionId).eq("overallAtTime", stars),
          )
      : ctx.db
          .query("reviewEntries")
          .withIndex("by_version_reactions", (q) => q.eq("versionId", versionId));
    const result = await q.order("desc").paginate(paginationOpts);
    return { ...result, page: await hydrateAll(ctx, result.page) };
  },
});

/** Latest posts, newest first. Paginated. */
export const feedLatest = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const result = await ctx.db
      .query("reviewEntries")
      .withIndex("by_createdAt")
      .order("desc")
      .paginate(paginationOpts);
    return { ...result, page: await hydrateAll(ctx, result.page) };
  },
});

/** The 50 posts with the most reactions in the last 7 days. */
export const feedTop = query({
  args: {},
  handler: async (ctx) => {
    const since = Date.now() - WEEK;
    const recent = await ctx.db
      .query("reactions")
      .withIndex("by_createdAt", (q) => q.gte("createdAt", since))
      .collect();
    const tally = new Map<Id<"reviewEntries">, number>();
    for (const r of recent) if (r.entryId) tally.set(r.entryId, (tally.get(r.entryId) ?? 0) + 1);
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 50);
    const entries = (await Promise.all(top.map(([id]) => ctx.db.get(id)))).filter(
      (e): e is Doc<"reviewEntries"> => e !== null,
    );
    return await hydrateAll(ctx, entries);
  },
});

/** Header line for the home feed. */
export const feedSummary = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const week = await ctx.db
      .query("reviewEntries")
      .withIndex("by_createdAt", (q) => q.gte("createdAt", now - WEEK))
      .collect();
    const today = week.filter((e) => e.createdAt >= now - DAY).length;
    const perVersion = new Map<Id<"versions">, number>();
    for (const e of week) if (e.versionId) perVersion.set(e.versionId, (perVersion.get(e.versionId) ?? 0) + 1);
    const [mostId] = [...perVersion.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
    const most = mostId ? await versionLabel(ctx, mostId) : null;
    return { today, mostReviewed: most?.displayName ?? null };
  },
});

/**
 * Data for the write-a-review screen. Never includes community scores.
 * `v` may be a catalog model that has no page yet; it's included as an option.
 */
export const forWrite = query({
  args: { v: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const viewerId = await getAuthUserId(ctx);
    const [versions, providers] = await Promise.all([
      ctx.db.query("versions").collect(),
      ctx.db.query("providers").collect(),
    ]);
    const providerName = new Map(providers.map((p) => [p._id, p.name]));
    const options: { versionId: string; displayName: string; provider: string; onSite: boolean }[] = versions
      .filter((ver) => ver.status === "active")
      .map((ver) => ({
        versionId: ver.versionId,
        displayName: ver.displayName,
        provider: providerName.get(ver.providerId) ?? "",
        onSite: true,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
    if (args.v && !options.some((o) => o.versionId === args.v)) {
      const entry = await ctx.db
        .query("catalog")
        .withIndex("by_orId", (q) => q.eq("orId", args.v!))
        .unique();
      if (entry) {
        options.unshift({ versionId: entry.orId, displayName: entry.name, provider: entry.provider, onSite: false });
      }
    }
    // Every axis anyone has rated on (plus the core ones), core first.
    const axes = (await ctx.db.query("axes").collect())
      .filter((a) => a.status === "active" && (a.core || a.ratingCount > 0))
      .sort(compareAxes)
      .map(publicAxis);
    // Your ratings by version (to start the form from) and when you last posted.
    // `xText`: your latest post's text when it's from X, to add ratings to.
    const prior: Record<
      string,
      {
        createdAt: number;
        lastPostAt: number;
        overall?: number;
        scores: Record<string, number>;
        xText?: string;
      }
    > = {};
    if (viewerId) {
      const mine = await ctx.db
        .query("reviews")
        .withIndex("by_user", (q) => q.eq("userId", viewerId))
        .collect();
      const versionIdOf = new Map(versions.map((ver) => [ver._id, ver.versionId]));
      for (const r of mine) {
        const key = versionIdOf.get(r.versionId);
        if (!key) continue;
        const last = await ctx.db
          .query("reviewEntries")
          .withIndex("by_review", (q) => q.eq("reviewId", r._id))
          .order("desc")
          .first();
        const scores: Record<string, number> = {};
        for (const row of await currentScores(ctx, r._id)) scores[row.axisId] = row.score;
        prior[key] = {
          createdAt: r.createdAt,
          lastPostAt: last?.createdAt ?? r.updatedAt,
          overall: r.overall,
          scores,
          xText: last?.xUrl ? last.text : undefined,
        };
      }
    }
    return { options, axes, prior };
  },
});

/**
 * Community averages for a version (overall + every axis), returned only once
 * the viewer has posted a review of it (anti-anchoring).
 */
export const communityAfterPost = query({
  args: { versionId: v.string() },
  handler: async (ctx, args) => {
    const viewerId = await getAuthUserId(ctx);
    if (!viewerId) return null;
    const version = await ctx.db
      .query("versions")
      .withIndex("by_versionId", (q) => q.eq("versionId", args.versionId))
      .unique();
    if (!version) return null;
    const versionId = version._id;
    const mine = await ctx.db
      .query("reviews")
      .withIndex("by_user_version", (q) =>
        q.eq("userId", viewerId).eq("versionId", versionId),
      )
      .unique();
    if (!mine) return null;
    const [stats, axisStats, myScores] = await Promise.all([
      statsFor(ctx, versionId),
      ctx.db
        .query("axisStats")
        .withIndex("by_version_axis", (q) => q.eq("versionId", versionId))
        .collect(),
      ctx.db
        .query("reviewScores")
        .withIndex("by_review", (q) => q.eq("reviewId", mine._id))
        .collect(),
    ]);
    const axes: Record<string, number | null> = {};
    for (const s of axisStats) axes[s.axisId] = avg(s);
    const myAxes: Record<string, number> = {};
    for (const s of myScores) myAxes[s.axisId] = s.score;
    return {
      overall: stats ? avg(stats.overall) : null,
      axes,
      mine: { overall: mine.overall, axes: myAxes },
    };
  },
});
