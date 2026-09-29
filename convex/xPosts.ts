import { ConvexError, v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  MutationCtx,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import {
  applyOverallToStats,
  bumpReviewerCount,
  deletePost,
  deleteReviewCascade,
  findOrActivateVersion,
  insertPost,
  retagPosts,
  ensureHandle,
  requireAdmin,
} from "./lib";
import { describe } from "./featured";

const DAY = 24 * 60 * 60 * 1000;
// How many posts one hourly recheck looks up on X.
const RECHECK_BATCH = 50;

/** The post id from an x.com / twitter.com status link, or null. */
export function parseTweetId(url: string) {
  return url.trim().match(/^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/\w+\/status(?:es)?\/(\d+)/i)?.[1] ?? null;
}

/** X ids are "snowflakes": the top bits are milliseconds since X's epoch. */
function snowflakeTime(tweetId: string) {
  return Number((BigInt(tweetId) >> 22n) + 1288834974657n);
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…" };
function decodeEntities(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

type FetchedPost = { authorName: string; authorHandle: string; text: string };

/**
 * Looks a post up with X's public embed endpoint (no API key). Returns null if
 * the post is gone or not public; throws on other failures so a hiccup at X
 * never hides a post.
 */
async function fetchPost(tweetId: string): Promise<FetchedPost | null> {
  const params = new URLSearchParams({
    url: `https://x.com/i/status/${tweetId}`,
    omit_script: "true",
    dnt: "true",
  });
  const res = await fetch(`https://publish.x.com/oembed?${params}`);
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) throw new Error(`X embed lookup failed: ${res.status}`);
  const data: unknown = await res.json();
  if (typeof data !== "object" || data === null) throw new Error("X embed lookup: unexpected response");
  const { author_name, author_url, html } = data as Record<string, unknown>;
  if (typeof author_name !== "string" || typeof author_url !== "string" || typeof html !== "string") {
    throw new Error("X embed lookup: missing fields");
  }
  const authorHandle = author_url.split("/").filter(Boolean).pop() ?? "";
  const body = html.match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "";
  const text = decodeEntities(
    body
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<a [^>]*>\s*pic\.(?:twitter|x)\.com\/\S*?<\/a>/gi, "") // attached media; the card links to X
      .replace(/<a [^>]*>([\s\S]*?)<\/a>/gi, "$1")
      .replace(/<[^>]+>/g, ""),
  ).trim();
  return { authorName: author_name, authorHandle, text };
}

// ---------- importing ----------

/**
 * Who an imported post is by: the member who signed in with that X account if there
 * is one, else a placeholder for it (created on its first imported post).
 */
async function authorFor(ctx: MutationCtx, authorName: string, authorHandle: string) {
  const member = (
    await ctx.db
      .query("users")
      .withIndex("by_xHandle", (q) => q.eq("xHandle", authorHandle))
      .collect()
  ).find((u) => !u.importedXHandle);
  if (member) return member;
  const importedXHandle = authorHandle.toLowerCase();
  const existing = await ctx.db
    .query("users")
    .withIndex("by_importedXHandle", (q) => q.eq("importedXHandle", importedXHandle))
    .first();
  if (existing) return existing;
  const userId = await ctx.db.insert("users", {
    name: authorName,
    xHandle: authorHandle,
    importedXHandle,
  });
  await ensureHandle(ctx, userId); // their X username, like an X sign-in gets
  return (await ctx.db.get(userId))!;
}

/** Adds a post from X to a model as a review by its author (admin). */
export const add = action({
  args: { url: v.string(), versionId: v.string() },
  handler: async (ctx, { url, versionId }): Promise<{ authorHandle: string }> => {
    const tweetId = parseTweetId(url);
    if (!tweetId) throw new ConvexError("That doesn’t look like a link to a post on X.");
    const post = await fetchPost(tweetId);
    if (!post) {
      throw new ConvexError("Couldn’t find that post. It may be deleted, or from a private account.");
    }
    await ctx.runMutation(internal.xPosts.insert, { tweetId, versionId, ...post });
    return { authorHandle: post.authorHandle };
  },
});

export const insert = internalMutation({
  args: {
    tweetId: v.string(),
    versionId: v.string(),
    authorName: v.string(),
    authorHandle: v.string(),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx); // the calling action's identity carries through
    const version = await findOrActivateVersion(ctx, args.versionId);
    if (!version) throw new ConvexError("Unknown model.");
    const earlier = (
      await ctx.db
        .query("xPosts")
        .withIndex("by_tweetId", (q) => q.eq("tweetId", args.tweetId))
        .collect()
    ).find((p) => p.versionId === version.versionId);
    if (earlier?.status === "active" || earlier?.status === "claimed") {
      throw new ConvexError("That post is already on this model.");
    }
    const now = Date.now();
    const postId = await ctx.db.insert("xPosts", {
      tweetId: args.tweetId,
      url: `https://x.com/${args.authorHandle}/status/${args.tweetId}`,
      versionId: version.versionId,
      authorName: args.authorName,
      authorHandle: args.authorHandle,
      authorHandleLower: args.authorHandle.toLowerCase(),
      text: args.text,
      postedAt: snowflakeTime(args.tweetId),
      addedBy: admin._id,
      status: "active",
      checkedAt: now,
    });
    if (earlier) await ctx.db.delete(earlier._id); // re-adding a removed post starts over
    await importAsReview(ctx, (await ctx.db.get(postId))!, version._id);
  },
});

/**
 * Makes a post from X a post on GoodBots by its author, under their rating of the
 * model (created, without stars, if they don't have one). If the author is already
 * a member, it's theirs from the start.
 */
async function importAsReview(ctx: MutationCtx, post: Doc<"xPosts">, versionId: Id<"versions">) {
  const author = await authorFor(ctx, post.authorName, post.authorHandle);
  const userId = author._id;
  let review = await ctx.db
    .query("reviews")
    .withIndex("by_user_version", (q) => q.eq("userId", userId).eq("versionId", versionId))
    .unique();
  if (review) {
    await ctx.db.patch(review._id, { updatedAt: Math.max(review.updatedAt, post.postedAt) });
  } else {
    const first = (await ctx.db
      .query("reviews")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first()) === null;
    if (first) await bumpReviewerCount(ctx, 1);
    const reviewId = await ctx.db.insert("reviews", {
      userId,
      versionId,
      createdAt: post.postedAt,
      updatedAt: post.postedAt,
    });
    await applyOverallToStats(ctx, versionId, null, undefined);
    review = (await ctx.db.get(reviewId))!;
  }
  const entryId = await insertPost(ctx, review, {
    text: post.text,
    xUrl: post.url,
    createdAt: post.postedAt,
  });
  await ctx.db.patch(post._id, {
    reviewId: review._id,
    entryId,
    ...(author.importedXHandle ? {} : { status: "claimed" as const }),
  });
}

/**
 * Takes an unclaimed imported post off the site: its entry, its review if that was
 * the only entry, and its placeholder author if they have nothing left.
 */
async function removeImported(ctx: MutationCtx, post: Doc<"xPosts">, reason: "deleted" | "admin") {
  await ctx.db.patch(post._id, { status: "removed", removedReason: reason });
  const review = post.reviewId ? await ctx.db.get(post.reviewId) : null;
  if (!review) return;
  const author = await ctx.db.get(review.userId);
  if (!author?.importedXHandle) return; // claimed: it's their review now
  const entry = post.entryId ? await ctx.db.get(post.entryId) : null;
  if (entry) await deletePost(ctx, entry);
  const more = await ctx.db
    .query("reviews")
    .withIndex("by_user", (q) => q.eq("userId", author._id))
    .first();
  if (!more) await ctx.db.delete(author._id);
}

/** The most recently added posts, for the admin page. */
export const recent = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const posts = await ctx.db.query("xPosts").order("desc").take(30);
    return await Promise.all(
      posts.map(async (p) => ({
        _id: p._id,
        url: p.url,
        authorHandle: p.authorHandle,
        text: p.text,
        versionId: p.versionId,
        reviewId: p.reviewId,
        model: (await describe(ctx, p.versionId))?.displayName ?? p.versionId,
        status: p.status,
        removedReason: p.removedReason,
      })),
    );
  },
});

/** Take an imported post off the site (admin). Once claimed, it's a normal review. */
export const remove = mutation({
  args: { postId: v.id("xPosts") },
  handler: async (ctx, { postId }) => {
    await requireAdmin(ctx);
    const post = await ctx.db.get(postId);
    if (post?.status === "active") await removeImported(ctx, post, "admin");
  },
});

/**
 * One-off: re-import a post whose review was deleted when its author claimed it
 * (before claiming merged into their existing review). It lands on their review.
 */
export const restoreLost = internalMutation({
  args: { postId: v.id("xPosts") },
  handler: async (ctx, { postId }) => {
    const post = await ctx.db.get(postId);
    if (!post) throw new ConvexError("No such post.");
    if (post.entryId && (await ctx.db.get(post.entryId))) return "still there";
    const version = await findOrActivateVersion(ctx, post.versionId);
    if (!version) throw new ConvexError("Unknown model.");
    await importAsReview(ctx, post, version._id);
    return "restored";
  },
});

/** One-off: turn posts added before imports became reviews into reviews. */
export const convertLegacy = internalMutation({
  args: {},
  handler: async (ctx) => {
    let converted = 0;
    for (const post of await ctx.db.query("xPosts").collect()) {
      if (post.status !== "active" || post.reviewId || post.claimedReviewId) continue;
      const version = await findOrActivateVersion(ctx, post.versionId);
      if (!version) continue;
      await importAsReview(ctx, post, version._id);
      converted++;
    }
    return converted;
  },
});

// ---------- claiming ----------

/**
 * Called on every sign-in: if this user signed in with an X account that has a
 * placeholder, their imported reviews become theirs and the placeholder goes away.
 * Where they already rated the same model, the imported posts join their posts
 * about it (their rating stays).
 */
export async function claimImports(ctx: MutationCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  if (!user?.xHandle || user.importedXHandle) return;
  const placeholder = await ctx.db
    .query("users")
    .withIndex("by_importedXHandle", (q) => q.eq("importedXHandle", user.xHandle!.toLowerCase()))
    .first();
  if (!placeholder) return;

  const hadReviews =
    (await ctx.db
      .query("reviews")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first()) !== null;
  const theirs = await ctx.db
    .query("reviews")
    .withIndex("by_user", (q) => q.eq("userId", placeholder._id))
    .collect();
  const conflicts: { review: Doc<"reviews">; own: Doc<"reviews"> }[] = [];
  for (const review of theirs) {
    const own = await ctx.db
      .query("reviews")
      .withIndex("by_user_version", (q) => q.eq("userId", userId).eq("versionId", review.versionId))
      .unique();
    if (own) {
      conflicts.push({ review, own });
      continue;
    }
    await ctx.db.patch(review._id, { userId });
    await retagPosts(ctx, review._id);
    for (const score of await ctx.db
      .query("reviewScores")
      .withIndex("by_review", (q) => q.eq("reviewId", review._id))
      .collect()) {
      await ctx.db.patch(score._id, { userId });
    }
  }
  // Move the posts under their own rating, then drop the emptied placeholder review.
  // Deleting the last one drops the placeholder from the reviewer count; if nothing
  // was deleted, they still leave it when two reviewers become one.
  const movedTo = new Map<Id<"reviews">, Id<"reviews">>();
  for (const { review, own } of conflicts) {
    let updatedAt = own.updatedAt;
    for (const entry of await ctx.db
      .query("reviewEntries")
      .withIndex("by_review", (q) => q.eq("reviewId", review._id))
      .collect()) {
      await ctx.db.patch(entry._id, { reviewId: own._id, userId });
      updatedAt = Math.max(updatedAt, entry.createdAt);
    }
    await ctx.db.patch(own._id, { updatedAt });
    await deleteReviewCascade(ctx, review);
    movedTo.set(review._id, own._id);
  }
  if (conflicts.length === 0 && hadReviews && theirs.length > 0) await bumpReviewerCount(ctx, -1);

  const now = Date.now();
  for (const post of await ctx.db
    .query("xPosts")
    .withIndex("by_authorHandleLower", (q) => q.eq("authorHandleLower", placeholder.importedXHandle!))
    .collect()) {
    const reviewId = post.reviewId && movedTo.get(post.reviewId);
    if (reviewId) await ctx.db.patch(post._id, { reviewId });
    if (post.status === "active") await ctx.db.patch(post._id, { status: "claimed", claimedAt: now });
  }
  await ctx.db.delete(placeholder._id);
}

// ---------- keeping up with X ----------

export const due = internalQuery({
  args: { before: v.number() },
  handler: async (ctx, { before }) => {
    const posts = await ctx.db
      .query("xPosts")
      .withIndex("by_status_and_checkedAt", (q) => q.eq("status", "active").lt("checkedAt", before))
      .take(RECHECK_BATCH);
    return posts.map((p) => ({ _id: p._id, tweetId: p.tweetId }));
  },
});

export const markChecked = internalMutation({
  args: {
    postId: v.id("xPosts"),
    post: v.union(
      v.null(),
      v.object({ authorName: v.string(), authorHandle: v.string(), text: v.string() }),
    ),
  },
  handler: async (ctx, { postId, post }) => {
    const existing = await ctx.db.get(postId);
    if (!existing || existing.status !== "active") return;
    if (!post) {
      await removeImported(ctx, existing, "deleted");
      return;
    }
    await ctx.db.patch(postId, { text: post.text, authorName: post.authorName, checkedAt: Date.now() });
    // Pick up edits to the post while it's still unclaimed.
    const entry = existing.entryId ? await ctx.db.get(existing.entryId) : null;
    if (entry && entry.text !== post.text) await ctx.db.patch(entry._id, { text: post.text });
  },
});

/** Cron: re-look-up unclaimed posts not checked in a day; remove ones deleted on X. */
export const recheck = internalAction({
  args: {},
  handler: async (ctx) => {
    const posts = await ctx.runQuery(internal.xPosts.due, { before: Date.now() - DAY });
    for (const { _id, tweetId } of posts) {
      try {
        const post = await fetchPost(tweetId);
        await ctx.runMutation(internal.xPosts.markChecked, { postId: _id, post });
      } catch (e) {
        console.warn(`[xPosts] couldn't recheck ${tweetId}:`, e);
      }
    }
  },
});
