import { ConvexError, v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  MutationCtx,
  query,
  QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { getViewer, isAdmin, requireAdmin, requireUser } from "./lib";
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

// ---------- admin ----------

/** Adds a post from X to a model's page (admin). */
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
    if (!(await describe(ctx, args.versionId))) throw new ConvexError("Unknown model.");
    const existing = (
      await ctx.db
        .query("xPosts")
        .withIndex("by_tweetId", (q) => q.eq("tweetId", args.tweetId))
        .collect()
    ).find((p) => p.versionId === args.versionId);
    const now = Date.now();
    const fields = {
      url: `https://x.com/${args.authorHandle}/status/${args.tweetId}`,
      authorName: args.authorName,
      authorHandle: args.authorHandle,
      authorHandleLower: args.authorHandle.toLowerCase(),
      text: args.text,
      checkedAt: now,
    };
    if (existing) {
      if (existing.status === "active") throw new ConvexError("That post is already on this model.");
      if (existing.removedReason === "author") {
        throw new ConvexError("Its author removed this post from GoodBots, so it can’t be added back.");
      }
      await ctx.db.patch(existing._id, { ...fields, status: "active", removedReason: undefined });
      return;
    }
    await ctx.db.insert("xPosts", {
      ...fields,
      tweetId: args.tweetId,
      versionId: args.versionId,
      postedAt: snowflakeTime(args.tweetId),
      addedBy: admin._id,
      status: "active",
    });
  },
});

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
        model: (await describe(ctx, p.versionId))?.displayName ?? p.versionId,
        status: p.claimedReviewId ? ("claimed" as const) : p.status,
        removedReason: p.removedReason,
      })),
    );
  },
});

// ---------- model pages ----------

function publicPost(p: Doc<"xPosts">, viewer: Doc<"users"> | null) {
  const mine = !!viewer?.xHandle && viewer.xHandle.toLowerCase() === p.authorHandleLower;
  return {
    _id: p._id,
    url: p.url,
    authorName: p.authorName,
    authorHandle: p.authorHandle,
    text: p.text,
    postedAt: p.postedAt,
    mine,
    canRemove: mine || isAdmin(viewer),
  };
}

export type XPost = ReturnType<typeof publicPost>;

/** A model's posts from X, newest first; ones their author turned into a review drop out. */
export const forModel = query({
  args: { versionId: v.string() },
  handler: async (ctx, { versionId }) => {
    const viewer = await getViewer(ctx);
    const posts = await ctx.db
      .query("xPosts")
      .withIndex("by_versionId", (q) => q.eq("versionId", versionId))
      .take(200);
    return posts
      .filter((p) => p.status === "active" && !p.claimedReviewId)
      .sort((a, b) => b.postedAt - a.postedAt)
      .map((p) => publicPost(p, viewer));
  },
});

/** Take a post off GoodBots: its author (signed in with that X account) or an admin. */
export const remove = mutation({
  args: { postId: v.id("xPosts") },
  handler: async (ctx, { postId }) => {
    const user = await requireUser(ctx);
    const post = await ctx.db.get(postId);
    if (!post) return;
    const author = !!user.xHandle && user.xHandle.toLowerCase() === post.authorHandleLower;
    if (!author && !isAdmin(user)) throw new ConvexError("Only its author or an admin can remove this post.");
    await ctx.db.patch(postId, { status: "removed", removedReason: author ? "author" : "admin" });
  },
});

// ---------- site-wide ----------

// Active posts scanned for site-wide counts; far more than we expect to add by hand.
const COUNT_SCAN = 5000;

/** Distinct authors and models among the posts on the site, and how many were posted since `since`. */
export async function xPostCounts(ctx: QueryCtx, since: number) {
  const authors = new Set<string>();
  const models = new Set<string>();
  let recent = 0;
  const posts = await ctx.db
    .query("xPosts")
    .withIndex("by_status_and_postedAt", (q) => q.eq("status", "active"))
    .order("desc")
    .take(COUNT_SCAN);
  for (const p of posts) {
    if (p.claimedReviewId) continue; // its author's review is counted instead
    authors.add(p.authorHandleLower);
    models.add(p.versionId);
    if (p.postedAt >= since) recent++;
  }
  return { authors, models, recent };
}

/** The newest posts from X across all models, for the reviews feed. */
export const feed = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    const posts = await ctx.db
      .query("xPosts")
      .withIndex("by_status_and_postedAt", (q) => q.eq("status", "active"))
      .order("desc")
      .take(100);
    const names = new Map<string, string>();
    const out = [];
    for (const p of posts) {
      if (p.claimedReviewId) continue;
      if (!names.has(p.versionId)) {
        names.set(p.versionId, (await describe(ctx, p.versionId))?.displayName ?? p.versionId);
      }
      out.push({ ...publicPost(p, viewer), versionId: p.versionId, model: names.get(p.versionId)! });
    }
    return out;
  },
});

export type XFeedPost = XPost & { versionId: string; model: string };

// ---------- claiming ----------

/** The signed-in user's own posts that are on GoodBots and not yet turned into reviews. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer?.xHandle) return [];
    const handle = viewer.xHandle.toLowerCase();
    const posts = await ctx.db
      .query("xPosts")
      .withIndex("by_authorHandleLower", (q) => q.eq("authorHandleLower", handle))
      .take(100);
    return await Promise.all(
      posts
        .filter((p) => p.status === "active" && !p.claimedReviewId)
        .map(async (p) => ({
          _id: p._id,
          versionId: p.versionId,
          model: (await describe(ctx, p.versionId))?.displayName ?? p.versionId,
          text: p.text,
        })),
    );
  },
});

/** Called when someone posts a review: their posts about that model count as claimed. */
export async function claimXPosts(
  ctx: MutationCtx,
  user: Doc<"users">,
  versionId: string,
  reviewId: Id<"reviews">,
) {
  if (!user.xHandle) return;
  const handle = user.xHandle.toLowerCase();
  const posts = await ctx.db
    .query("xPosts")
    .withIndex("by_authorHandleLower", (q) => q.eq("authorHandleLower", handle))
    .take(100);
  const now = Date.now();
  for (const p of posts) {
    if (p.versionId === versionId && p.status === "active" && !p.claimedReviewId) {
      await ctx.db.patch(p._id, { claimedReviewId: reviewId, claimedAt: now });
    }
  }
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
      await ctx.db.patch(postId, { status: "removed", removedReason: "deleted", checkedAt: Date.now() });
      return;
    }
    // Pick up edits and renamed accounts.
    await ctx.db.patch(postId, {
      ...post,
      authorHandleLower: post.authorHandle.toLowerCase(),
      url: `https://x.com/${post.authorHandle}/status/${existing.tweetId}`,
      checkedAt: Date.now(),
    });
  },
});

/** Cron: re-look-up posts not checked in a day; hide ones deleted on X. */
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
