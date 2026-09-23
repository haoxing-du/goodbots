import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { requireMember } from "./lib";

// Review screenshots. The client asks for an upload URL, POSTs the file, then
// registers the returned storage id here; posting a review attaches it.

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const DAY = 24 * 60 * 60 * 1000;
/** Unposted uploads live this long (drafts are kept for a day). */
const PENDING_TTL = 2 * DAY;
const MAX_PENDING = 10;

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireMember(ctx);
    const pending = await ctx.db
      .query("uploads")
      .withIndex("by_user", (q) => q.eq("userId", user._id).gte("createdAt", Date.now() - DAY))
      .take(MAX_PENDING);
    if (pending.length >= MAX_PENDING) {
      throw new ConvexError("That’s a lot of screenshots today. Post or remove some first.");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Claim a just-uploaded file and return its URL. Anything that isn't a small
 * image is deleted and an error returned (throwing would roll back the delete).
 */
export const register = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const user = await requireMember(ctx);
    const claimed = await ctx.db
      .query("uploads")
      .withIndex("by_storage", (q) => q.eq("storageId", storageId))
      .unique();
    if (claimed) throw new ConvexError("That image is already taken.");
    const file = await ctx.db.system.get("_storage", storageId);
    if (!file) throw new ConvexError("That upload didn’t arrive. Try again.");
    const problem =
      !file.contentType || !IMAGE_TYPES.includes(file.contentType)
        ? "Use a PNG, JPEG or WebP image."
        : file.size > MAX_IMAGE_BYTES
          ? "That image is over 5 MB."
          : null;
    if (problem) {
      await ctx.storage.delete(storageId);
      return { error: problem };
    }
    await ctx.db.insert("uploads", { storageId, userId: user._id, createdAt: Date.now() });
    const url = await ctx.storage.getUrl(storageId);
    return url ? { url } : { error: "That upload didn’t arrive. Try again." };
  },
});

/** Throw away an upload you haven't posted (removed from the draft). */
export const discard = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const user = await requireMember(ctx);
    const row = await ctx.db
      .query("uploads")
      .withIndex("by_storage", (q) => q.eq("storageId", storageId))
      .unique();
    if (!row || row.userId !== user._id) return;
    await ctx.db.delete(row._id);
    await ctx.storage.delete(storageId);
  },
});

/** Delete uploads that were never posted. */
export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const stale = await ctx.db
      .query("uploads")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", Date.now() - PENDING_TTL))
      .take(200);
    for (const row of stale) {
      await ctx.db.delete(row._id);
      await ctx.storage.delete(row.storageId);
    }
  },
});

/**
 * Check that `userId` may put `storageId` on a review entry: either their own
 * pending upload (claimed here) or an image already on this review.
 */
export async function claimImage(
  ctx: MutationCtx,
  userId: Id<"users">,
  reviewId: Id<"reviews"> | null,
  storageId: Id<"_storage">,
) {
  const row = await ctx.db
    .query("uploads")
    .withIndex("by_storage", (q) => q.eq("storageId", storageId))
    .unique();
  if (row) {
    if (row.userId !== userId) throw new ConvexError("That image isn’t yours.");
    await ctx.db.delete(row._id);
    return;
  }
  if (reviewId && (await imageOnReview(ctx, reviewId, storageId))) return;
  throw new ConvexError("That screenshot expired. Add it again.");
}

async function imageOnReview(
  ctx: MutationCtx,
  reviewId: Id<"reviews">,
  storageId: Id<"_storage">,
  except?: Id<"reviewEntries">,
) {
  const entries = await ctx.db
    .query("reviewEntries")
    .withIndex("by_review", (q) => q.eq("reviewId", reviewId))
    .collect();
  return entries.some((e) => e._id !== except && e.image === storageId);
}

/** Delete an entry's image file unless another entry of the review still shows it. */
export async function releaseImage(
  ctx: MutationCtx,
  reviewId: Id<"reviews">,
  storageId: Id<"_storage">,
  entryId: Id<"reviewEntries">,
) {
  if (!(await imageOnReview(ctx, reviewId, storageId, entryId))) {
    await ctx.storage.delete(storageId);
  }
}
