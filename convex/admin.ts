import { ConvexError, v } from "convex/values";
import { mutation, MutationCtx, query } from "./_generated/server";
import { bumpAxis, compareAxes, getOrCreateStats, publicUser, requireAdmin } from "./lib";

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Adds a version, creating its model (by family) if needed. */
export async function createVersion(
  ctx: MutationCtx,
  args: {
    family: string;
    provider: string;
    versionId: string;
    displayName: string;
    releasedAt?: number;
  },
) {
  const versionId = args.versionId.trim();
  const dupe = await ctx.db
    .query("versions")
    .withIndex("by_versionId", (q) => q.eq("versionId", versionId))
    .first();
  if (dupe) throw new ConvexError(`Version ${versionId} already exists.`);

  const slug = slugify(args.family);
  let model = await ctx.db
    .query("models")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  if (!model) {
    const id = await ctx.db.insert("models", {
      family: args.family.trim(),
      familyLower: args.family.trim().toLowerCase(),
      provider: args.provider.trim(),
      slug,
    });
    model = (await ctx.db.get(id))!;
  }
  const id = await ctx.db.insert("versions", {
    modelId: model._id,
    versionId,
    displayName: args.displayName.trim(),
    releasedAt: args.releasedAt ?? Date.now(),
    status: "active",
  });
  await getOrCreateStats(ctx, id);
  return id;
}

export const addVersion = mutation({
  args: {
    family: v.string(),
    provider: v.string(),
    versionId: v.string(),
    displayName: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (!args.family.trim() || !args.versionId.trim() || !args.displayName.trim()) {
      throw new ConvexError("Family, version id and display name are required.");
    }
    await createVersion(ctx, args);
  },
});

// ---------- axes ----------

export const axes = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const all = (await ctx.db.query("axes").collect()).sort(compareAxes);
    return await Promise.all(
      all.map(async (a) => {
        const creator = a.createdBy ? await ctx.db.get(a.createdBy) : null;
        return {
          _id: a._id,
          name: a.name,
          core: a.core,
          status: a.status,
          ratingCount: a.ratingCount,
          createdBy: creator ? publicUser(creator) : null,
          createdAt: a.createdAt,
        };
      }),
    );
  },
});

/** Hide or unhide a custom axis. Hidden axes vanish from forms, pages and cards; scores are kept. */
export const setAxisStatus = mutation({
  args: { axisId: v.id("axes"), status: v.union(v.literal("active"), v.literal("hidden")) },
  handler: async (ctx, { axisId, status }) => {
    await requireAdmin(ctx);
    const axis = await ctx.db.get(axisId);
    if (!axis) throw new ConvexError("Unknown axis.");
    if (axis.core) throw new ConvexError("Core axes can't be hidden.");
    await ctx.db.patch(axisId, { status });
  },
});

/**
 * Merge a custom axis into another (e.g. "UI design" → "Design"). Scores move
 * over; where a review rated both, the target's score wins. The source axis is deleted.
 */
export const mergeAxis = mutation({
  args: { fromId: v.id("axes"), intoId: v.id("axes") },
  handler: async (ctx, { fromId, intoId }) => {
    await requireAdmin(ctx);
    if (fromId === intoId) throw new ConvexError("Pick two different axes.");
    const [from, into] = await Promise.all([ctx.db.get(fromId), ctx.db.get(intoId)]);
    if (!from || !into) throw new ConvexError("Unknown axis.");
    if (from.core) throw new ConvexError("Core axes can't be merged away.");

    const rows = await ctx.db
      .query("reviewScores")
      .withIndex("by_axis", (q) => q.eq("axisId", fromId))
      .collect();
    let moved = 0;
    for (const row of rows) {
      await bumpAxis(ctx, row.versionId, fromId, row.score, -1);
      const both = await ctx.db
        .query("reviewScores")
        .withIndex("by_review", (q) => q.eq("reviewId", row.reviewId))
        .filter((q) => q.eq(q.field("axisId"), intoId))
        .first();
      if (both) {
        await ctx.db.delete(row._id);
      } else {
        await ctx.db.patch(row._id, { axisId: intoId });
        await bumpAxis(ctx, row.versionId, intoId, row.score, 1);
        moved++;
      }
    }
    for (const stat of await ctx.db
      .query("axisStats")
      .withIndex("by_axis", (q) => q.eq("axisId", fromId))
      .collect()) {
      await ctx.db.delete(stat._id);
    }
    await ctx.db.delete(fromId);
    return { moved, dropped: rows.length - moved };
  },
});
